package com.campus.service.impl;

import cn.hutool.core.lang.TypeReference;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.constant.GoodsStatus;
import com.campus.dto.*;
import com.campus.entity.*;
import com.campus.exception.BusinessException;
import com.campus.mapper.*;
import com.campus.result.PageResult;
import com.campus.service.GoodsService;
import com.campus.service.BloomFilterService;
import com.campus.service.RedisStockService;
import com.campus.utils.RiskLevelUtil;
import com.campus.utils.SensitiveWordFilter;
import com.campus.vo.*;
import kotlin.jvm.internal.Lambda;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.DeletedStatus.*;
import static com.campus.constant.GoodsAppealStatus.*;
import static com.campus.constant.GoodsOffShelfType.userOFF_SHELF;
import static com.campus.constant.GoodsStatus.*;
import static com.campus.constant.OrderStatus.*;
import static com.campus.constant.UserStatus.*;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class GoodsServiceImpl implements GoodsService {

    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final CategoryMapper categoryMapper;
    private final GoodsCollectMapper goodsCollectMapper;
    private final UserMapper userMapper;
    private final GoodsOffShelfMapper goodsOffShelfMapper;
    private final RiskLevelUtil riskLevelUtil;
    private final SensitiveWordFilter sensitiveWordFilter;
    private final GoodsInterceptMapper goodsInterceptMapper;
    private final GoodsAppealMapper goodsAppealMapper;
    private final AddressBookMapper addressBookMapper;
    private final DormitoryMapper dormitoryMapper;
    private final CartMapper cartMapper;
    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final RedisStockService redisStockService;
    private final StringRedisTemplate redisTemplate;
    private final BloomFilterService bloomFilterService;

    private void evictUserGoodsListCache(Long userId) {
        redisTemplate.delete("userGoodsList:" + userId);
    }

    private void evictCommonGoodsListCache(Long userId) {
        redisTemplate.delete("commonGoodsList:" + userId);
    }

    /**
     * 根据分类id与模糊字段获取商品列表并分页
     * @param query
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<GoodsListVO> getGoodsList(GoodsPageQuery query) {
        //创建分页对象：传入当前页与每页数据条数
        Page<Goods> page = new Page<>(query.getPageNum(), query.getPageSize());

        //构建查询条件：满足上架+待出售 QueryWrapper本身为链式构造器(不用写builder()与build())
        //构建查询条件
        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getDeleted, NOT_DELETED)//逻辑未删除：0-未删除 1-已删除
                .eq(Goods::getShelfStatus, goodsSHELF_ON)//上架状态：0-下架 1-上架
                .eq(Goods::getSaleStatus, goodsSALE_PENDING)//待出售状态：0-待出售 1-已售出 2-交付中
                .eq(Goods::getAuditStatus, AUDIT_STATUS_PASS)//审核通过
                .gt(Goods::getStock, 0)//库存大于0
                .orderByDesc(Goods::getCreateTime);//按发布时间倒序

        //分类筛选:(全部)-为前端硬编码不传值-category_id=null
        if (query.getCategoryId() != null) {
            wrapper.eq(Goods::getCategoryId, query.getCategoryId());
        }
        //根据关键词进行模糊搜索
        if (StrUtil.isNotBlank(query.getKeyword())) {
            wrapper.like(Goods::getName, query.getKeyword());
        }

        //分页查询数据库(放入分页条件与查询条件)
        Page<Goods> goodsPage = goodsMapper.selectPage(page, wrapper);

        //封装VO
        List<GoodsListVO> voList = new ArrayList<>();
        //获取当前页记录
        List<Goods> records = goodsPage.getRecords();
        List<Long> goodsIds = records.stream().map(Goods::getId).collect(Collectors.toList());

        //批量查询商品首图（sort=0）：goodsIds 为空时跳过，避免 SQL IN () 语法错误
        List<GoodsImage> imgList = new ArrayList<>();
        if (!goodsIds.isEmpty()) {
            imgList = goodsImageMapper.selectList(
                    new LambdaQueryWrapper<GoodsImage>()
                            .in(GoodsImage::getGoodsId, goodsIds)
                            .eq(GoodsImage::getSort, 0)
            );
        }
        Map<Long, String> imageMap = imgList.stream().collect(
                Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));

        for (Goods goods : records) {
            GoodsListVO vo = new GoodsListVO().builder()
                    .goodsId(goods.getId())
                    .name(goods.getName())
                    .collectCount(goods.getCollectCount())
                    .price(goods.getPrice())
                    //getOrDefault()为安全取值方法:从Map里根据商品ID拿图片地址,有就拿图片,没有就给空字符串,不会报错
                    .firstImage(imageMap.getOrDefault(goods.getId(), ""))
                    .build();

            voList.add(vo);
        }

        //返回分页结果(带泛型的写法-加了@Builder的类，不能写new)
        return PageResult.<GoodsListVO>builder()
                .records(voList)
                .total(goodsPage.getTotal())
                .size(goodsPage.getSize())
                .current(goodsPage.getCurrent())
                .pages(goodsPage.getPages())
                .build();
    }

    /**
     * 获取商品详情
     * @param goodsId
     * @return
     */
    @Cacheable(value = "goodsDetail", key = "#goodsId",sync = true)
    @Transactional(readOnly = true)
    public GoodsDetailVO getGoodsDetail(Long goodsId) {
        // 布隆过滤器前置拦截：不存在直接返回，防缓存穿透
        if (!bloomFilterService.mightContain("goods", goodsId)) {
            return null;
        }
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) {
            return null;
        }
        User user = userMapper.selectById(goods.getUserId());
        if (user == null) {
            return null;
        }
        //查询买家自提时的地址宿舍楼
        String addressDormitory = null;
        if (goods.getAddressId() != null) {
            AddressBook addr = addressBookMapper.selectById(goods.getAddressId());
            if (addr != null && addr.getDormitoryId() != null) {
                Dormitory dorm = dormitoryMapper.selectById(addr.getDormitoryId());
                if (dorm != null) {
                    addressDormitory = dorm.getName();
                }
            }
        }

        GoodsDetailVO goodsDetailVO = new GoodsDetailVO().builder()
                .userId(user.getId())
                .username(user.getUsername())
                .avatar(user.getAvatar())
                .goodsId(goods.getId())
                .goodsName(goods.getName())
                .categoryId(goods.getCategoryId())
                .createTime(goods.getCreateTime())
                .imageUrls(goodsImageMapper.selectByGoodsId(goodsId))
                .description(goods.getDescription())
                .price(goods.getPrice())
                .stock(goods.getStock())
                .auditStatus(goods.getAuditStatus())
                .shelfStatus(goods.getShelfStatus())
                .transactionType(goods.getTransactionType())
                .addressId(goods.getAddressId())
                .addressDormitory(addressDormitory)
                .build();
        return goodsDetailVO;
    }

    /**
     * 批量获取商品详情（确认订单回显用）
     * @param goodsIds
     * @return
     */
    @Transactional(readOnly = true)
    public List<GoodsDetailVO> batchGetGoodsDetail(List<Long> goodsIds) {
        if (goodsIds == null || goodsIds.isEmpty()) {
            return Collections.emptyList();
        }

        //隔离校验：只查询当前用户购物车中存在的商品
        List<Cart> cartList = cartMapper.selectList(
                new LambdaQueryWrapper<Cart>()
                        .eq(Cart::getUserId, getCurrentUserId())
                        .in(Cart::getGoodsId, goodsIds)
        );
        if (cartList.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> validGoodsIds = cartList.stream().map(Cart::getGoodsId).distinct().collect(Collectors.toList());

        //批量查询商品
        List<Goods> goodsList = goodsMapper.selectBatchIds(validGoodsIds);
        if (goodsList.isEmpty()) {
            return Collections.emptyList();
        }

        //批量查询卖家信息
        List<Long> userIds = goodsList.stream().map(Goods::getUserId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        Map<Long, User> userMap = userMapper.selectBatchIds(userIds)
                .stream().collect(Collectors.toMap(User::getId, u -> u));

        //批量查询商品图片（按sort排序）
        List<GoodsImage> images = goodsImageMapper.selectList(
                new LambdaQueryWrapper<GoodsImage>()
                        .in(GoodsImage::getGoodsId, validGoodsIds)
                        .orderByAsc(GoodsImage::getSort)
        );
        //按商品id分组：goodsId -> [url, url, ...]
        Map<Long, List<String>> imageMap = images.stream()
                .collect(Collectors.groupingBy(GoodsImage::getGoodsId,
                        Collectors.mapping(GoodsImage::getUrl, Collectors.toList())));

        //批量查询自提地址
        Map<Long, String> addressDormitoryMap = new HashMap<>();
        List<Long> addressIds = goodsList.stream().map(Goods::getAddressId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (!addressIds.isEmpty()) {
            List<AddressBook> addrList = addressBookMapper.selectBatchIds(addressIds);
            List<Long> dormitoryIds = addrList.stream().map(AddressBook::getDormitoryId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
            if (!dormitoryIds.isEmpty()) {
                Map<Long, String> dormMap = dormitoryMapper.selectBatchIds(dormitoryIds)
                        .stream().collect(Collectors.toMap(Dormitory::getId, Dormitory::getName));
                for (AddressBook addr : addrList) {
                    if (addr.getDormitoryId() != null) {
                        addressDormitoryMap.put(addr.getId(), dormMap.get(addr.getDormitoryId()));
                    }
                }
            }
        }

        //组装GoodsDetailVO列表
        List<GoodsDetailVO> voList = new ArrayList<>();
        for (Goods goods : goodsList) {
            User user = userMap.get(goods.getUserId());
            if (user == null) continue;

            voList.add(new GoodsDetailVO().builder()
                    .userId(user.getId())
                    .username(user.getUsername())
                    .avatar(user.getAvatar())
                    .goodsId(goods.getId())
                    .goodsName(goods.getName())
                    .categoryId(goods.getCategoryId())
                    .createTime(goods.getCreateTime())
                    .imageUrls(imageMap.getOrDefault(goods.getId(), Collections.emptyList()))
                    .description(goods.getDescription())
                    .price(goods.getPrice())
                    .stock(goods.getStock())
                    .auditStatus(goods.getAuditStatus())
                    .shelfStatus(goods.getShelfStatus())
                    .transactionType(goods.getTransactionType())
                    .addressId(goods.getAddressId())
                    .addressDormitory(addressDormitoryMap.get(goods.getAddressId()))
                    .build());
        }
        return voList;
    }

    /**
     * 发布商品
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goods:audit:page", allEntries = true),
            @CacheEvict(value = "userGoodsStats", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")})
    public void publishGoods(GoodsEditDTO dto) {
        User user = userMapper.selectById(getCurrentUserId());

        if (user == null || DELETED.equals(user.getDeleted()) || userDISABLE.equals(user.getStatus())) {
            throw new BusinessException("账号异常，无法发布商品");
        }

        if (user.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校");
        }

        //校验交易方式
        if (dto.getTransactionType() == null ||
                dto.getTransactionType() < 1 || dto.getTransactionType() > 3) {
            throw new BusinessException("交易方式无效");
        }
        if (Integer.valueOf(2).equals(dto.getTransactionType()) && dto.getAddressId() == null) {
            throw new BusinessException("买家自提请选择地址");
        }
        if (!Integer.valueOf(2).equals(dto.getTransactionType())) {
            dto.setAddressId(null);
        }

        Goods goods = new Goods().builder()
                .userId(getCurrentUserId())
                .schoolId(user.getSchoolId())//填入发布者当前绑定学校id
                .categoryId(dto.getCategoryId())
                .name(dto.getName())
                .description(dto.getDescription())
                .price(dto.getPrice())
                .stock(dto.getStock())//库存
                .transactionType(dto.getTransactionType())//交易方式
                .addressId(dto.getAddressId())//地址簿ID(买家自提时)
                .appealCount(3)//申诉次数
                .shelfStatus(goodsSHELF_ON)//待出售
                .auditStatus(AUDIT_STATUS_WAIT_SYSTEM)//待系统审核
                .saleStatus(goodsSHELF_OFF)//下架
                .risk(RISK_HIGH)//高风险
                .hasApproved(HAS_APPROVED_NO)//从未审核通过
                .collectCount(0)
                .build();
        goodsMapper.insert(goods);
        //新商品ID加入布隆过滤器
        bloomFilterService.add("goods", goods.getId());
        //若用户上传图片则保存商品图片
        if (dto.getImages() != null) {
            String[] images = dto.getImages().split(",");
            for (int i = 0; i < images.length; i++) {
                GoodsImage goodsImage = new GoodsImage().builder()
                        .goodsId(goods.getId())
                        .url(images[i])
                        .sort(i)
                        .build();
                goodsImageMapper.insert(goodsImage);
            }
        }
        evictUserGoodsListCache(getCurrentUserId());
    }

    /**
     * 修改商品-编辑时库存修改从5到3，库存缓存不会直接修改为3，而是现有库存缓存-2
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId"),
            @CacheEvict(value = "goods:audit:page", allEntries = true)})
    public void updateGoods(Long goodsId,GoodsEditDTO dto) {
        //用户校验
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || DELETED.equals(user.getDeleted()) || userDISABLE.equals(user.getStatus())) {
            throw new BusinessException("账号异常，无法修改商品");
        }

        //查询原商品
        Goods oldGoods = goodsMapper.selectById(goodsId);
        if (oldGoods == null) {
            throw new BusinessException("商品不存在");
        }

        //允许编辑的条件：待出售+(上架或下架)
        boolean canEdit = goodsSALE_PENDING.equals(oldGoods.getSaleStatus())
                && (goodsSHELF_ON.equals(oldGoods.getShelfStatus())
                || goodsSHELF_OFF.equals(oldGoods.getShelfStatus()));

        if (!canEdit) {
            throw new BusinessException("仅待出售状态的商品可编辑（上架/下架均可）");
        }


        //校验交易方式
        if (dto.getTransactionType() != null &&
                (dto.getTransactionType() < 1 || dto.getTransactionType() > 3)) {
            throw new BusinessException("交易方式无效");
        }

        Goods newgoods = new Goods().builder()
                .id(goodsId)
                .categoryId(dto.getCategoryId())
                .name(dto.getName())
                .description(dto.getDescription())
                .price(dto.getPrice())
                .stock(dto.getStock())
                .transactionType(dto.getTransactionType())
                .addressId(dto.getAddressId())
                .build();

        //规则1：从未审核通过(第一次发布的商品) → 强制高风险，重置为待系统审核
        if (HAS_APPROVED_NO.equals(oldGoods.getHasApproved())) {
            newgoods.setAuditStatus(AUDIT_STATUS_WAIT_SYSTEM);//待系统审核
        }
        else {
            //规则2：已经至少通过一次审核 + 当前被系统or人工拦截 → 重新判定风险
            if (AUDIT_STATUS_SYSTEM_BLOCK.equals(oldGoods.getAuditStatus()) ||
                    AUDIT_STATUS_ADMIN_BLOCK.equals(oldGoods.getAuditStatus())) {
                //根据修改内容判断风险等级
                int newRisk = riskLevelUtil.calculateRiskLevel(oldGoods, dto);
                newgoods.setAuditStatus(AUDIT_STATUS_WAIT_SYSTEM);//待系统审核
                newgoods.setRisk(newRisk);//新风险等级
            }
            //规则3：已经至少通过一次审核 + 当前审核通过状态 → 根据修改内容决定是否重新审核
            if (AUDIT_STATUS_PASS.equals(oldGoods.getAuditStatus())) {
                //判断是否修改了商品核心内容（名称/描述/价格/图片），仅修改库存/地址/分类/交易方式则无需重新审核
                    int newRisk = riskLevelUtil.calculateRiskLevel(oldGoods, dto);
                    if (newRisk != RISK_LOW) {
                        newgoods.setAuditStatus(AUDIT_STATUS_WAIT_SYSTEM);//待系统审核
                        newgoods.setRisk(newRisk);//新风险等级
                    }
            }
        }

        goodsMapper.updateById(newgoods);

        //同步Redis库存：根据差值调整，保持已预扣库存不变
        //假如现有10库存，有用户买了6件待支付，预扣库存后10-6=4，也就是说这4件是无人占用的资源，释放资源的数量不能大于这个数
        //假如我要修改库存为8,8-10=-2，代表我要释放2件资源，-2＋4=2，释放资源件数在允许释放件数范围内-可以
        //假如我要修改库存为6,6-10=-4，代表我要释放4件资源，-4＋4=0，释放资源件数等于允许释放件数范围内-可以
        //假如我要修改库存为3,3-10=-7，代表我要释放7件资源，-7＋4=-3，释放资源件数超过允许释放件数-不可以
        if (dto.getStock() != null) {
            Integer currentRedis = redisStockService.getStock(goodsId);
            if (currentRedis == null) {
                //Redis无缓存，直接初始化
                redisStockService.initStock(goodsId, dto.getStock());
            } else {
                int diff = dto.getStock() - oldGoods.getStock();
                if (diff > 0) {
                    redisStockService.incrStock(goodsId, diff);
                } else if (diff < 0) {
                    int pendingCount = oldGoods.getStock() - currentRedis;//正在交易中的件数
                    if (currentRedis + diff < 0) {
                        throw new BusinessException("该商品有" + pendingCount + "件正在交易中，暂不能减少库存，请稍后再试");
                    }
                    redisStockService.decrStock(goodsId, -diff);
                }
            }
        }

        //若交易方式不是买家自提，清空关联地址
        if (dto.getTransactionType() != null && !Integer.valueOf(2).equals(dto.getTransactionType())) {
            goodsMapper.update(null, new LambdaUpdateWrapper<Goods>()
                    .eq(Goods::getId, goodsId)
                    .set(Goods::getAddressId, null));
        }

        //若用户修改图片则先删除旧图片再批量插入新的
        if (dto.getImages() != null) {
            //删除商品所有旧图片
            goodsImageMapper.deleteByGoodsId(goodsId);
            String[] images = dto.getImages().split(",");
            for (int i = 0; i < images.length; i++) {
                GoodsImage goodsImage = new GoodsImage().builder()
                        .goodsId(goodsId)
                        .url(images[i])
                        .sort(i)
                        .build();
                goodsImageMapper.insert(goodsImage);
            }
        }
        evictUserGoodsListCache(getCurrentUserId());
        evictCommonGoodsListCache(getCurrentUserId());
    }

    /**
     * 下架商品
     * @param goodsId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId")})
    public void offShelfGoods(Long goodsId) {
        //将对应商品改成下架状态
        LambdaUpdateWrapper<Goods> wrapper = Wrappers.lambdaUpdate(Goods.class);
        wrapper.eq(Goods::getId, goodsId)
                .set(Goods::getShelfStatus, goodsSHELF_OFF);
        goodsMapper.update(wrapper);

        //下架时删除Redis库存
        redisStockService.deleteStock(goodsId);

        GoodsOffShelf goodsOffShelf = new GoodsOffShelf().builder()
                .goodsId(goodsId)
                .operatorId(getCurrentUserId())
                .offShelfType(userOFF_SHELF)
                .reason("用户主动下架")
                .build();
        goodsOffShelfMapper.insert(goodsOffShelf);
        evictUserGoodsListCache(getCurrentUserId());
        evictCommonGoodsListCache(getCurrentUserId());
    }

    /**
     * 上架商品
     * @param goodsId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId")})
    public void onShelfGoods(Long goodsId) {
        User user = userMapper.selectById(getCurrentUserId());

        //账号异常校验
        if (user == null || DELETED.equals(user.getDeleted()) || userDISABLE.equals(user.getStatus())) {
            throw new BusinessException("账号异常，无法上架商品");
        }

        //查询原商品
        Goods oldGoods = goodsMapper.selectById(goodsId);
        if (oldGoods == null) {
            throw new BusinessException("商品不存在");
        }

        //允许上架的条件：待出售
        boolean canEdit = goodsSALE_PENDING.equals(oldGoods.getSaleStatus());
        if (!canEdit) {
            throw new BusinessException("仅待出售状态的商品可上架");
        }

        //将对应商品改成上架状态
        LambdaUpdateWrapper<Goods> wrapper = Wrappers.lambdaUpdate(Goods.class);
        wrapper.eq(Goods::getId, goodsId)
                .set(Goods::getShelfStatus, goodsSHELF_ON);
        goodsMapper.update(wrapper);

        //上架时同步Redis库存
        redisStockService.initStock(goodsId, oldGoods.getStock());
        evictUserGoodsListCache(getCurrentUserId());
        evictCommonGoodsListCache(getCurrentUserId());
    }

    /**
     * 商品删除：单个/批量 逻辑删除（把deleted改成1）
     * @param goodsIds
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userGoodsStats", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")})
    public void deleteGoods(List<Long> goodsIds) {
        goodsMapper.deleteBatchIds(goodsIds);
        evictUserGoodsListCache(getCurrentUserId());
    }

    /**
     * 用户个人中心-我的闲置（已上架/已下架/违规商品/审核待处理/申诉待处理，前端传tab）
     * @param query
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<GoodsQueryVO> getUserGoodsList(Long userId,UserComQueryDTO query) {

        // Hash缓存：key = userGoodsList:<userId>, field = <pageNum>_<pageSize>_<tab>_<keyword>
        String hashKey = "userGoodsList:" + userId;
        String field = query.getPageNum() + "_" + query.getPageSize() + "_" + query.getTab() + "_" + (query.getKeyword() != null ? query.getKeyword() : "");
        Object cached = redisTemplate.opsForHash().get(hashKey, field);
        if (cached != null) {
            return JSONUtil.toBean((String) cached, new TypeReference<PageResult<GoodsQueryVO>>() {}, false);
        }

        Page<Goods> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getDeleted, NOT_DELETED)
                .eq(Goods::getUserId, userId)
                .orderByDesc(Goods::getCreateTime);

        switch (query.getTab()) {
            case 1:
                //已上架：待出售 / 上架 / 审核通过 /低风险
                wrapper.eq(Goods::getSaleStatus, goodsSALE_PENDING);
                wrapper.eq(Goods::getShelfStatus, goodsSHELF_ON);
                wrapper.eq(Goods::getAuditStatus, AUDIT_STATUS_PASS);
                wrapper.eq(Goods::getRisk, RISK_LOW);
                break;
            case 2:
                //已下架：待出售or已出售 / 下架 / 审核通过 /低风险
                wrapper.in(Goods::getSaleStatus, goodsSALE_PENDING, goodsSALE_SOLD);
                wrapper.eq(Goods::getShelfStatus, goodsSHELF_OFF);
                wrapper.eq(Goods::getAuditStatus, AUDIT_STATUS_PASS);
                wrapper.eq(Goods::getRisk, RISK_LOW);
                break;
            case 3:
                //违规商品：系统拦截or人工拦截
                wrapper.and(w -> w
                        .eq(Goods::getAuditStatus, AUDIT_STATUS_SYSTEM_BLOCK)
                        .or()
                        .eq(Goods::getAuditStatus, AUDIT_STATUS_ADMIN_BLOCK)
                );
                break;
            case 4:
                //审核待处理：待系统审核or待人工审核
                wrapper.and(w -> w
                        .eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_SYSTEM)
                        .or()
                        .eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_ADMIN)
                );
                break;
            case 5:
                //申诉待处理：待申诉审核
                wrapper.eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_APPEAL);
                break;
            default:
                throw new RuntimeException("tab参数错误，只能是1-5");
        }

        //关键词搜索
        if (StrUtil.isNotBlank(query.getKeyword())) {
            wrapper.like(Goods::getName, query.getKeyword());
        }

        //分页查询
        Page<Goods> goodsPage = goodsMapper.selectPage(page, wrapper);

        List<GoodsQueryVO> voList = new ArrayList<>();
        List<Goods> records = goodsPage.getRecords();
        List<Long> goodsIds = records.stream().map(Goods::getId).collect(Collectors.toList());

        //批量查询商品首图（sort=0）：一次性查完再用map取
        List<GoodsImage> imgList;
        if (goodsIds.isEmpty()) {
            imgList = Collections.emptyList();
        } else {
            imgList = goodsImageMapper.selectList(
                    new LambdaQueryWrapper<GoodsImage>()
                            .in(GoodsImage::getGoodsId, goodsIds)
                            .eq(GoodsImage::getSort, 0)
            );
        }
        Map<Long, String> imageMap = imgList.stream().collect(
                Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));


        for (Goods goods : records) {

            GoodsQueryVO vo = GoodsQueryVO.builder()
                    .goodsId(goods.getId())
                    .name(goods.getName())
                    .price(goods.getPrice())
                    .stock(goods.getStock())
                    .saleStatus(goods.getSaleStatus())
                    .build();

            switch (query.getTab()) {
                //====================== case3: 违规商品 ======================
                case 3: {
                    vo.setAppealCount(goods.getAppealCount());//申诉次数
                    break;
                }
            }
            vo.setAuditStatus(goods.getAuditStatus());//审核状态
            vo.setFirstImage(imageMap.getOrDefault(goods.getId(), ""));

            voList.add(vo);
        }
        PageResult<GoodsQueryVO> result = PageResult.<GoodsQueryVO>builder()
                .records(voList)
                .total(goodsPage.getTotal())
                .size(goodsPage.getSize())
                .current(goodsPage.getCurrent())
                .pages(goodsPage.getPages())
                .build();
        redisTemplate.opsForHash().put(hashKey, field, JSONUtil.toJsonStr(result));
        return result;
    }

    /**
     * 通用个人中心-闲置
     * @param query
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<GoodsQueryVO> getCommonGoodsList(Long userId,CommonQueryDTO query) {

        // Hash缓存：key = commonGoodsList:<userId>, field = <pageNum>_<pageSize>
        String hashKey = "commonGoodsList:" + userId;
        String field = query.getPageNum() + "_" + query.getPageSize();
        Object cached = redisTemplate.opsForHash().get(hashKey, field);
        if (cached != null) {
            return JSONUtil.toBean((String) cached, new TypeReference<PageResult<GoodsQueryVO>>() {}, false);
        }

        Page<Goods> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getDeleted, NOT_DELETED)
                .eq(Goods::getUserId, userId)
                .eq(Goods::getAuditStatus, AUDIT_STATUS_PASS)
                .and(w -> {
                    //待出售+已上架
                    w.and(w1 -> w1.eq(Goods::getSaleStatus, goodsSALE_PENDING)
                                    .eq(Goods::getShelfStatus, goodsSHELF_ON))
                            //或已售出+已下架
                            .or(w2 -> w2.eq(Goods::getSaleStatus, goodsSALE_SOLD)
                                    .eq(Goods::getShelfStatus, goodsSHELF_OFF));
                })
                .orderByDesc(Goods::getCreateTime);

        //分页查询
        Page<Goods> goodsPage = goodsMapper.selectPage(page, wrapper);

        //封装VO
        List<GoodsQueryVO> voList = new ArrayList<>();
        List<Goods> records = goodsPage.getRecords();
        List<Long> goodsIds = records.stream().map(Goods::getId).collect(Collectors.toList());

        //批量查询商品首图（sort=0）：一次性查完再用map取
        List<GoodsImage> imgList;
        if (goodsIds.isEmpty()) {
            imgList = Collections.emptyList();
        } else {
            imgList = goodsImageMapper.selectList(
                    new LambdaQueryWrapper<GoodsImage>()
                            .in(GoodsImage::getGoodsId, goodsIds)
                            .eq(GoodsImage::getSort, 0)
            );
        }
        Map<Long, String> imageMap = imgList.stream().collect(
                Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));

        for (Goods goods : records) {
            GoodsQueryVO vo = GoodsQueryVO.builder()
                    .goodsId(goods.getId())
                    .name(goods.getName())
                    .price(goods.getPrice())
                    .stock(goods.getStock())
                    .saleStatus(goods.getSaleStatus())
                    .firstImage(imageMap.getOrDefault(goods.getId(), ""))
                    .build();

            voList.add(vo);
        }

        PageResult<GoodsQueryVO> result = PageResult.<GoodsQueryVO>builder()
                .records(voList)
                .total(goodsPage.getTotal())
                .size(goodsPage.getSize())
                .current(goodsPage.getCurrent())
                .pages(goodsPage.getPages())
                .build();
        redisTemplate.opsForHash().put(hashKey, field, JSONUtil.toJsonStr(result));
        return result;
    }

    /**
     * 收藏或取消收藏商品
     * @param goodsId
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public void toggleCollect(Long goodsId, Long userId) {

        //判断商品是否存在
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) {
            throw new RuntimeException("商品不存在");
        }

        //查询是否已收藏
        LambdaQueryWrapper<GoodsCollect> wrapper = Wrappers.lambdaQuery(GoodsCollect.class)
                .eq(GoodsCollect::getUserId, userId)
                .eq(GoodsCollect::getGoodsId, goodsId);
        GoodsCollect existingCollect = goodsCollectMapper.selectOne(wrapper);

        if (existingCollect == null) {
            //未收藏->执行收藏
            GoodsCollect collect = GoodsCollect.builder()
                    .userId(userId)
                    .goodsId(goodsId)
                    .build();
            goodsCollectMapper.insert(collect);

            //商品收藏量+1(数据库原子操作)
            goodsMapper.updateCollectCountPlus(goodsId);
        }
        else {
            //已收藏->取消收藏
            goodsCollectMapper.deleteById(existingCollect.getId());

            //商品收藏量-1(数据库原子操作)
            goodsMapper.updateCollectCountMinus(goodsId);
        }
    }

    /**
     * 获取用户是否已收藏商品
     * @param goodsId
     * @param userId
     * @return
     */
    @Transactional(readOnly = true)
    public Boolean getCollectStatus(Long goodsId, Long userId) {
        //查询是否已收藏
        LambdaQueryWrapper<GoodsCollect> wrapper = Wrappers.lambdaQuery(GoodsCollect.class)
                .eq(GoodsCollect::getUserId, userId)
                .eq(GoodsCollect::getGoodsId, goodsId);
        return goodsCollectMapper.selectOne(wrapper) != null;
    }

    /**
     * 商品申诉提交接口
     * @param goodsId
     * @param submitDTO
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true)})
    public void submitGoodsAppeal(Long goodsId, GoodsAppealSubmitDTO submitDTO) {
        //查询旧商品数据
        Goods oldGoods = goodsMapper.selectById(goodsId);
        if (oldGoods == null) {
            return;
        }
        //申诉次数必须>0才能申诉
        if (oldGoods.getAppealCount() <= 0) {
            throw new RuntimeException("可申诉次数不足，无法提交申诉");
        }

        goodsMapper.updateById(
                Goods.builder()
                        .id(goodsId)
                        .auditStatus(AUDIT_STATUS_WAIT_APPEAL)
                        .appealCount(oldGoods.getAppealCount() - 1)//可申诉次数减一
                        .build());

        goodsAppealMapper.insert(
                GoodsAppeal.builder()
                        .appealUserId(getCurrentUserId())
                        .goodsId(goodsId)
                        .appealContent(submitDTO.getAppealContent())
                        .appealStatus(APPEAL_UNFINISHED)
                        .build());
        evictUserGoodsListCache(getCurrentUserId());
    }

    /**
     * 商品确认收到申诉结果接口-商品状态从待申诉审核转为人工拦截
     * @param goodsId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true)})
    public void confirmGoodsBlock(Long goodsId) {
        goodsMapper.updateById(Goods.builder()
                .id(goodsId)
                .auditStatus(AUDIT_STATUS_ADMIN_BLOCK)
                .build());
        evictUserGoodsListCache(getCurrentUserId());
    }

    /**
     * 根据商品ID查询违规详情
     * @param goodsId
     * @return
     */
    public GoodsInterceptVO getInterceptDetailByGoodsId(Long goodsId) {
        GoodsIntercept intercept = goodsInterceptMapper.selectOne(
                new LambdaQueryWrapper<GoodsIntercept>()
                        .eq(GoodsIntercept::getGoodsId, goodsId)//商品ID匹配
                        .orderByDesc(GoodsIntercept::getInterceptTime)//只取拦截时间最新
                        .last("LIMIT 1")//只取第一条
        );

        if (intercept == null) {
            return null;
        }

        GoodsInterceptVO vo = GoodsInterceptVO.builder()
                .interceptReason(intercept.getInterceptReason())
                .interceptTime(intercept.getInterceptTime())
                .build();

        //拼接拦截对象
        if (intercept.getInterceptType() == 2) {
            vo.setInterceptTarget("系统001");
        } else if (intercept.getInterceptType() == 1) {
            vo.setInterceptTarget("工号" + intercept.getAdminId());
        }
        return vo;
    }

    /**
     * 根据商品ID查询申诉详情
     * @param goodsId
     * @return
     */
    public GoodsAppealVO getAppealDetailByGoodsId(Long goodsId) {
        GoodsAppeal appeal = goodsAppealMapper.selectOne(
                new LambdaQueryWrapper<GoodsAppeal>()
                        .eq(GoodsAppeal::getGoodsId, goodsId)
                        .orderByDesc(GoodsAppeal::getCreateTime)
                        .last("LIMIT 1")
        );
        if (appeal == null) {
            return null;
        }

        GoodsAppealVO vo = GoodsAppealVO.builder()
                .appealContent(appeal.getAppealContent())//用户的申诉内容
                .auditReason(appeal.getAuditReason())//申诉不通过的原因
                .build();

        vo.setAuditAdmin("工号" + appeal.getAuditAdminId());
        //如果该商品对应的状态为申诉未完成：则仅展示申诉内容、申诉处理中
        vo.setAppealStatuss(appeal.getAppealStatus());

        if (appeal.getAppealStatus() == APPEAL_UNFINISHED) {
            vo.setAppealStatus("申诉处理中");
        } else if (appeal.getAppealStatus() == APPEAL_FINISHED) {
            vo.setAppealStatus("已完成申诉");
        }
        return vo;
    }

    /**
     * 系统敏感词自动审核：对【待系统审核-audit_status=0的商品进行敏感词校验和状态更新
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "userGoodsList", allEntries = true),
            @CacheEvict(value = "commonGoodsList", allEntries = true)})
    public void autoAuditGoods() {
        //查询所有待系统审核的商品
        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_SYSTEM)
                .last("LIMIT 100");
        List<Goods> pendingList = goodsMapper.selectList(wrapper);

        if (pendingList.isEmpty()) {
            log.info("暂无待系统审核的商品");
            return;
        }

        log.info("开始自动审核，共 {} 件商品", pendingList.size());

        for (Goods goods : pendingList) {
            try {
                processAutoAudit(goods);
                //审核后清除该商品的详情缓存
                clearGoodsDetailCache(goods.getId());
            } catch (Exception e) {
                log.error("商品 {} 自动审核异常: {}", goods.getId(), e.getMessage(), e);
            }
        }
        log.info("自动审核完成");
    }

    /**
     * 处理单个商品的自动审核
     */
    private void processAutoAudit(Goods goods) {
        //敏感词校验
        boolean hasSensitive = checkSensitive(goods);

        if (hasSensitive) {
            //校验不通过
            goodsMapper.updateById(Goods.builder()
                    .id(goods.getId())
                    .auditStatus(AUDIT_STATUS_SYSTEM_BLOCK)
                    .build());

            //写拦截表
            GoodsIntercept intercept = GoodsIntercept.builder()
                    .goodsId(goods.getId())
                    .interceptType(INTERCEPT_SYSTEM)
                    .interceptReason("商品内容包含敏感词，可申诉或修改后重新发布")
                    .adminId(-1L)
                    .build();
            goodsInterceptMapper.insert(intercept);

            log.info("商品 {} 包含敏感词，审核不通过", goods.getId());
        } else {
            //校验通过
            if (RISK_MIDDLE.equals(goods.getRisk()) && HAS_APPROVED_YES.equals(goods.getHasApproved())) {
                //中风险且已经至少通过一次 → 通过并降为低风险
                goodsMapper.updateById(Goods.builder()
                        .id(goods.getId())
                        .auditStatus(AUDIT_STATUS_PASS)
                        .risk(RISK_LOW)
                        .build());
            } else {
                //转人工审核
                goodsMapper.updateById(Goods.builder()
                        .id(goods.getId())
                        .auditStatus(AUDIT_STATUS_WAIT_ADMIN)
                        .build());
                log.info("商品 {} 敏感词校验通过，转人工审核", goods.getId());
            }
        }
    }

    /**
     * 对商品的名称、描述进行敏感词校验
     */
    private boolean checkSensitive(Goods goods) {
        //校验名称
        if (goods.getName() != null && sensitiveWordFilter.containsSensitive(goods.getName())) {
            log.info("商品 {} 名称包含敏感词：{}", goods.getId(), goods.getName());
            return true;
        }
        //校验描述
        if (goods.getDescription() != null && sensitiveWordFilter.containsSensitive(goods.getDescription())) {
            log.info("商品 {} 描述包含敏感词", goods.getId());
            return true;
        }
        return false;
    }

    /**
     * 清除指定商品的详情缓存
     */
    @CacheEvict(value = "goodsDetail", key = "#goodsId")
    public void clearGoodsDetailCache(Long goodsId) {
    }

    /**
     * 订单通用数量查询（用户端主页数据概览）
     * @param userId 当前用户ID
     * @return
     */
    @Cacheable(value = "userGoodsStats", key = "#userId", sync = true)
    @Transactional(readOnly = true)
    public UserGoodsStatsVO getUserGoodsStats(Long userId) {
        // 1.查询我的闲置数量（goods表中userId匹配且saleStatus=0）
        LambdaQueryWrapper<Goods> goodsQw = Wrappers.lambdaQuery(Goods.class);
        goodsQw.eq(Goods::getUserId, userId)
                .eq(Goods::getSaleStatus, goodsSALE_PENDING);
        Long myIdleCount = goodsMapper.selectCount(goodsQw);

        // 2.查询订单进行中数量
        // 2a.作为卖家：order_item中sellerId匹配且status为1/2/5
        LambdaQueryWrapper<OrderItem> sellerOngoingQw = Wrappers.lambdaQuery(OrderItem.class);
        sellerOngoingQw.eq(OrderItem::getSellerId, userId)
                .in(OrderItem::getStatus, PAID, SHIPPED, REFUNDING);
        Long sellerOngoing = orderItemMapper.selectCount(sellerOngoingQw);

        // 2b.作为买家：order中userId匹配且status为1（已付款）
        LambdaQueryWrapper<Order> buyerOngoingQw = Wrappers.lambdaQuery(Order.class);
        buyerOngoingQw.eq(Order::getUserId, userId)
                .eq(Order::getStatus, PAID);
        Long buyerOngoing = orderMapper.selectCount(buyerOngoingQw);

        Long ongoingOrderCount = sellerOngoing + buyerOngoing;

        // 3.查询订单已完成数量
        // 3a.作为卖家：order_item中sellerId匹配且status为3（已完成）
        LambdaQueryWrapper<OrderItem> sellerCompletedQw = Wrappers.lambdaQuery(OrderItem.class);
        sellerCompletedQw.eq(OrderItem::getSellerId, userId)
                .eq(OrderItem::getStatus, COMPLETED);
        Long sellerCompleted = orderItemMapper.selectCount(sellerCompletedQw);

        // 3b.作为买家：order中userId匹配且status为2（已完成）
        LambdaQueryWrapper<Order> buyerCompletedQw = Wrappers.lambdaQuery(Order.class);
        buyerCompletedQw.eq(Order::getUserId, userId)
                .eq(Order::getStatus, ORDER_COMPLETED);
        Long buyerCompleted = orderMapper.selectCount(buyerCompletedQw);

        Long completedOrderCount = sellerCompleted + buyerCompleted;

        return UserGoodsStatsVO.builder()
                .myIdleCount(myIdleCount)
                .ongoingOrderCount(ongoingOrderCount)
                .completedOrderCount(completedOrderCount)
                .build();
    }
}
