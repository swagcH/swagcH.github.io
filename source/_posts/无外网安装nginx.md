---
title: 无外网安装nginx
date: 2024-05-22 13:04:02
updated: 2024-06-02 13:05:29
tags:
  - 运维
  - Linux
categories: Linux运维
cover: /images/posts/2024/offline-nginx-cover.png
---

![无外网安装Nginx封面图](/images/posts/2024/offline-nginx-cover.png)

<blockquote>
<p>写在前面：客户给的服务器是银河麒麟，然后不给外网权限，要求安装nginx，网上教程基本没有这种情况的。也是踩了很多的坑，所以记录一下方便后面的bro。PS：重点在于如何安装上nginx，比较基础的操作可以同时参考其他教程一起看！！</p>
</blockquote>


<h2 id="1-服务器情况："><a href="#1-服务器情况：" class="headerlink" title="1. 服务器情况："></a>1. 服务器情况：</h2><figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br></pre></td><td class="code"><pre><span class="line"><span class="built_in">cat</span> /proc/version</span><br><span class="line">Linux version 4.19.90-23.8.v2101.ky10.x86_64</span><br></pre></td></tr></tbody></table></figure>

<h2 id="2-准备工作"><a href="#2-准备工作" class="headerlink" title="2.准备工作"></a>2.准备工作</h2><h3 id="2-1-首先判断是否安装了nginx的三个依赖"><a href="#2-1-首先判断是否安装了nginx的三个依赖" class="headerlink" title="2.1.首先判断是否安装了nginx的三个依赖"></a>2.1.首先判断是否安装了nginx的三个依赖</h3><ol>
<li>gcc</li>
<li>pcre</li>
<li>zlib</li>
</ol>
<p>可以访问外网的情况下可以直接命令行一键安装</p>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br></pre></td><td class="code"><pre><span class="line">yum -y install gcc zlib zlib-devel pcre-devel openssl </span><br></pre></td></tr></tbody></table></figure>

<p>本篇就不涉及有外网了，重点在无外网。</p>
<p>没外网的情况下，需要先手动下载上面三个依赖包，方便大家我就把整合好的地址放下面，大家有需要就自取</p>
<p>链接：<a target="_blank" rel="noopener" href="https://pan.baidu.com/s/1r0c0o6ORbOdB9vM8RoWUrA?pwd=bpmy">https://pan.baidu.com/s/1r0c0o6ORbOdB9vM8RoWUrA?pwd=bpmy</a><br>提取码：bpmy </p>
<p>下载好了以后，分别把三个依赖包，和nginx，指定到自己指定的位置<br>我是把依赖包解压到了/usr/local/src下</p>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span><br><span class="line">4</span><br></pre></td><td class="code"><pre><span class="line">这是解压命令</span><br><span class="line">tar -xvf openssl-3.0.13.tar.gz</span><br><span class="line"></span><br><span class="line">三个包手动替换的名称就好</span><br></pre></td></tr></tbody></table></figure>

<blockquote>
<p>重点！！！</p>
</blockquote>
<p>回到nginx的安装目录，执行下面的命令</p>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span><br><span class="line">4</span><br><span class="line">5</span><br></pre></td><td class="code"><pre><span class="line">./configure --prefix=/usr/local/nginx   --with-pcre=/usr/local/src/pcre-7.3 --with-zlib=/usr/local/src/zlib  --with-openssl=/usr/local/src/openssl</span><br><span class="line"></span><br><span class="line">解释</span><br><span class="line">--prefix 是指定nginx的安装路径，后续的我们操作的nginx都会在这里，类似于windows的选择安装路径</span><br><span class="line">--with-xxx 指定依赖的解压路径，用来找到我们刚刚解压缩的那三个依赖。</span><br></pre></td></tr></tbody></table></figure>

<p>没报错的情况下，继续执行</p>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span><br><span class="line">4</span><br></pre></td><td class="code"><pre><span class="line">make</span><br><span class="line">make install</span><br><span class="line"></span><br><span class="line">就可以正常安装了</span><br></pre></td></tr></tbody></table></figure>

<p>到这里nginx应该就安装成功了，后续就是一些优化操作</p>
<ol>
<li>可以删除nginx压缩包和解压目录<br>2.设置软链，后续就不用在安装nginx的目录下操作nginx</li>
</ol>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span><br><span class="line">4</span><br><span class="line">5</span><br></pre></td><td class="code"><pre><span class="line"><span class="built_in">ln</span> -s /usr/local/webserver/nginx/sbin/nginx /usr/bin/</span><br><span class="line"></span><br><span class="line">在其他目录使用</span><br><span class="line">nginx -v</span><br><span class="line">查看是否设置成功</span><br></pre></td></tr></tbody></table></figure>

<p>3.nginx常用命令</p>
<figure class="highlight bash"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span><br><span class="line">4</span><br><span class="line">5</span><br><span class="line">6</span><br><span class="line">7</span><br><span class="line">8</span><br><span class="line">9</span><br></pre></td><td class="code"><pre><span class="line"><span class="comment"># 检查配置</span></span><br><span class="line">$ nginx -t（检查nginx.conf配置是否正确）</span><br><span class="line">$ nginx -s reload（重新载入配置文件，通常配合-t使用，在修改了nginx.conf且检查无误之后）</span><br><span class="line"></span><br><span class="line"><span class="comment"># 启动</span></span><br><span class="line">$ nginx</span><br><span class="line"></span><br><span class="line"><span class="comment"># 查看进程</span></span><br><span class="line">$ ps -ef | grep nginx</span><br></pre></td></tr></tbody></table></figure>

<blockquote>
<p>之前部署项目的时候没遇到过国产系统+无内网两种情况叠加，导致踩坑了两天才调通，希望这篇文章能对后面遇到这种情况的兄弟们有所帮助！</p>
</blockquote>
