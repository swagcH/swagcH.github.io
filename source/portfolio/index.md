---
title: 作品集
date: 2026-10-15 00:00:00
type: page
comments: false
---
<div class="portfolio-page">
  <section class="page-hero portfolio-hero">
    <h1>作品集</h1>
    <span class="page-hero-line"></span>
    <p>六个项目，三条能力线：生产系统交付 · 稳定性治理 · AI 工程化落地</p>
  </section>
  <section class="portfolio-section">
    <header class="section-heading">
      <h2>生产系统交付</h2>
      <span></span>
    </header>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>深圳能源大屏</h3>
          <p class="project-role">后端技术负责人</p>
        </div>
        <time>2024.05 - 2026.03</time>
      </div>
      <p class="project-desc">
        面向集团级经营与生产监控的数据大屏。围绕集团概况、产业布局、低碳电力、生态环保、综合燃气、数智服务、专题介绍 7 大主题建设，共 36 个业务板块，接入 167 家生产企业，展示 6000 余项数据与各厂监控画面。
      </p>
      <dl class="project-meta">
        <dt>技术栈</dt>
        <dd>SpringCloud · ShardingSphere · MinIO · Redis · Nginx · MySQL</dd>
        <dt>我的职责</dt>
        <dd>主导后端技术选型与架构设计；负责与大数据平台、SIS 等 9 个异构系统的数据集成；配置维护 4 台服务器并部署 Nginx 负载均衡；引入 MinIO 作为对象存储方案</dd>
        <dt>技术难点</dt>
        <dd>9 个来源系统的数据模型、更新频率、接口协议各不相同，需要统一成一致的指标口径对外提供；单表数据量增长后查询变慢，采用 ShardingSphere 分片提升可扩展性</dd>
        <dt>量化规模</dt>
        <dd>36 个业务板块 · 167 家生产企业 · 9 个系统集成 · 580 个指标 · 4 台服务器</dd>
      </dl>
    </article>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>医院电子通行证系统</h3>
          <p class="project-role">后端主程</p>
        </div>
        <time>2022.03 - 2024.04</time>
      </div>
      <p class="project-desc">
        管理医院出入人员并联动门禁闸机的系统，支持读取、保存、分析通行记录，提供实时访客记录、门禁管理与授权管理。已被十余家医院采购并投入使用。
      </p>
      <dl class="project-meta">
        <dt>技术栈</dt>
        <dd>SpringCloud · RabbitMQ · ShardingSphere · ElasticSearch · Redis · Nginx · MySQL</dd>
        <dt>我的职责</dt>
        <dd>核心需求分析评审与项目进度把控；独立负责出入记录、门禁管理等核心模块的设计、开发与维护；对接微信公众号与阿里云短信实现业务预警；协调前后端联调并推进落地</dd>
        <dt>技术难点</dt>
        <dd>通行记录是典型的高频写入 + 按时间范围检索场景，单表很快到达瓶颈，使用 ShardingSphere 自动分库分表；人员服务与设备模块原先强耦合，引入 RabbitMQ 解耦以提升响应速度；登录信息与字典数据用 Redis 缓存降低数据库压力</dd>
        <dt>量化规模</dt>
        <dd>十余家医院在用 · 门禁设备联动 · 高频通行记录写入</dd>
      </dl>
    </article>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>病案无纸化管理系统</h3>
          <p class="project-role">后端主程</p>
        </div>
        <time>2022.03 - 2024.04</time>
      </div>
      <p class="project-desc">
        基于电子签名技术实现无纸化归档的电子病案管理系统，提供数据采集、归档、打印、借阅、封存等功能，整合各临床信息系统数据形成完整电子病案卷宗，使数据可脱离原系统独立展示与查阅。
      </p>
      <dl class="project-meta">
        <dt>技术栈</dt>
        <dd>SpringBoot · MySQL · Redis · MinIO</dd>
        <dt>我的职责</dt>
        <dd>核心需求分析与进度把控；独立负责病案借阅、封存模块的设计开发与维护；对接微信公众号、阿里云短信实现业务消息推送与预警</dd>
        <dt>技术难点</dt>
        <dd>病案文件体积大、数量多，使用 MinIO 对象存储提升上传下载速度与并发能力；借阅场景存在恶意重复下载风险，基于 Redis 对用户下载次数做监控与限制</dd>
      </dl>
    </article>
  </section>
  <section class="portfolio-section">
    <header class="section-heading">
      <h2>稳定性治理与自动化</h2>
      <span></span>
    </header>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>自建 AI 基础设施与运维自动化</h3>
          <p class="project-role">独立设计与实现</p>
        </div>
        <time>2025 - 至今</time>
      </div>
      <p class="project-desc">
        为多个个人项目统一接入大模型能力，并把这套基础设施的部署、监控、故障恢复做成自动化流程，减少人工介入。
      </p>
      <dl class="project-meta">
        <dt>核心组件</dt>
        <dd>
          统一 LLM 网关（聚合 4 家供应商、40+ 模型条目，配置 35 条 fallback 链与默认兜底模型）<br>
          双服务器架构（Cloudflare 命名隧道对外暴露 6 个域名，主机防火墙做来源白名单）<br>
          定时任务体系（模型清单扫描、服务健康检查、内容抓取与早报推送）<br>
          告警通道（异常直接推送至飞书）
        </dd>
        <dt>我解决的问题</dt>
        <dd>
          <strong>供应商差异</strong>：4 家平台的鉴权方式、接口协议、限流策略各不相同，通过网关统一为一种调用方式<br>
          <strong>链路可用性</strong>：单模型故障时按 fallback 链自动降级，避免业务中断<br>
          <strong>动态 IP 断连</strong>：公网 IP 漂移会导致运维通道整体失联，实现"从防火墙拦截日志自动识别来源 + 可信网段校验 + 自动放行 + 审计留痕"的闭环<br>
          <strong>服务自愈</strong>：关键服务配置健康检查与自动重启，异常时主动告警而非静默失败
        </dd>
        <dt>量化规模</dt>
        <dd>4 家模型供应商 · 40+ 模型条目 · 35 条降级链 · 6 个对外域名 · 7 个定时任务</dd>
      </dl>
    </article>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>一次跨层排障：远程桌面服务客户端持续"未就绪"</h3>
          <p class="project-role">独立排查</p>
        </div>
        <time>2026.10</time>
      </div>
      <p class="project-desc">
        自建远程桌面服务端后，客户端始终显示"未就绪"。服务端进程正常、端口全通、健康检查毫秒级返回，但客户端无法完成注册。
      </p>
      <dl class="project-meta">
        <dt>排查路径</dt>
        <dd>
          ① 分层验证：先确认服务端自身健康（容器状态、资源占用、监听端口）<br>
          ② 网络层抓包：发现 TCP 三次握手正常，但客户端建连后<strong>未发送任何数据即关闭</strong>，排除服务端拒绝的可能<br>
          ③ 日志比对：服务端注册计数恒为 0，客户端却在反复请求一个<strong>服务端文档中并不存在的端口</strong><br>
          ④ 源码级确认：对照客户端源码中的响应分支，确认该版本依赖服务端管理端能力，而开源版不提供
        </dd>
        <dt>结论与处理</dt>
        <dd>定位为客户端版本与服务端的能力依赖不匹配，属于上游兼容性缺口，非配置问题。停止继续投入，回退方案并完整清理已部署组件，恢复防火墙策略与访问白名单，验证外部端口全部关闭。</dd>
        <dt>体现的能力</dt>
        <dd>分层排除法 · 抓包取证 · 日志关联分析 · 源码验证 · 及时止损的判断</dd>
      </dl>
    </article>
  </section>
  <section class="portfolio-section">
    <header class="section-heading">
      <h2>完整项目实践</h2>
      <span></span>
    </header>
    <article class="project-card">
      <div class="project-head">
        <div>
          <h3>德州扑克策略训练站</h3>
          <p class="project-role">独立设计、开发与部署</p>
        </div>
        <time>2026.09 - 2026.10</time>
      </div>
      <p class="project-desc">
        面向策略训练的全栈应用：完整的规则引擎、可玩的交互界面、AI 对手与决策复盘系统。已部署上线，整站带访问密码保护。
      </p>
      <dl class="project-meta">
        <dt>技术栈</dt>
        <dd>React 19 · TypeScript · Tailwind 4 · Zustand · Vitest · Node.js · Docker</dd>
        <dt>工程亮点</dt>
        <dd>
          <strong>测试覆盖</strong>：245 个单元测试，覆盖规则引擎、AI 决策、鉴权与数据计算<br>
          <strong>确定性设计</strong>：所有随机行为由种子派生，同一分享链接可完整复现同一局牌，为回放与复盘提供基础<br>
          <strong>AI 对手</strong>：本地决策引擎（按牌力、底池赔率、SPR 计算动作分布）+ 大模型生成对手人格，兼顾实时性与多样性<br>
          <strong>可解释复盘</strong>：把决策依据可视化（胜率构成、底池赔率与实际胜率对比、动作分布），并区分"靠对手弃牌获胜"与"靠牌力摊牌获胜"两类结局<br>
          <strong>成本控制</strong>：模型调用按内容哈希缓存，重复查看不重复计费
        </dd>
        <dt>踩坑与修复</dt>
        <dd>
          <strong>CDN 缓存绕过访问控制</strong>：静态资源原使用可被 CDN 缓存的头，导致未登录用户可直接从 CDN 取到资源。改为不参与 CDN 缓存后修复，并用响应头验证<br>
          <strong>进程级崩溃</strong>：中间件回调语义理解错误导致响应重复写入，单个请求异常会使整个进程退出。修正判断逻辑并补充异常兜底<br>
          <strong>移动端适配</strong>：桌面端布局在手机上座位卡重叠，按断点重构牌桌比例与卡片尺寸
        </dd>
        <dt>量化规模</dt>
        <dd>245 个单测 · 40+ 模型调用场景 · 完整部署流水线</dd>
      </dl>
    </article>
  </section>
  <section class="portfolio-section">
    <header class="section-heading">
      <h2>能力自评</h2>
      <span></span>
    </header>
    <div class="skill-groups">
      <div class="skill-row"><strong>后端与架构</strong><p>Java · SpringCloud · 微服务拆分 · 分库分表 · 接口设计 · 事务边界</p></div>
      <div class="skill-row"><strong>数据与中间件</strong><p>MySQL 调优 · Redis 缓存设计 · RabbitMQ 解耦 · ElasticSearch · MinIO</p></div>
      <div class="skill-row"><strong>稳定性与运维</strong><p>Linux · Docker · Nginx · 日志与指标分析 · 抓包取证 · 故障排查</p></div>
      <div class="skill-row"><strong>AI 工程化</strong><p>LLM 网关 · 降级与兜底 · Prompt 工程 · Agent 工作流 · 成本控制</p></div>
      <div class="skill-row"><strong>全栈与交付</strong><p>TypeScript · React · 单元测试 · CI/CD · 部署与回滚</p></div>
    </div>
  </section>
  <section class="about-section contact-section">
    <header class="section-heading">
      <h2>进一步了解</h2>
      <span></span>
    </header>
    <p class="contact-intro">上面每个项目都有对应的技术文章，展开写了设计取舍与踩坑过程。欢迎针对具体实现细节交流。</p>
    <div class="contact-links">
      <a href="/series/"><i class="fa fa-layer-group"></i><span>技术专题<strong>按能力线阅读</strong></span></a>
      <a href="/about/"><i class="fa fa-book-open"></i><span>关于我<strong>经历与方向</strong></span></a>
      <a href="/archives/"><i class="fa fa-book-open"></i><span>文章归档<strong>浏览全部内容</strong></span></a>
      <a href="/atom.xml"><i class="fa fa-rss"></i><span>RSS<strong>订阅更新</strong></span></a>
    </div>
  </section>
</div>
