if (document.querySelector(".comment-barrage")) {
  var commentBarrageConfig = {
    maxBarrage: GLOBAL_CONFIG.commentBarrageConfig.maxBarrage,
    barrageTime: GLOBAL_CONFIG.commentBarrageConfig.barrageTime,
    twikooUrl: GLOBAL_CONFIG.twikooEnvId,
    accessToken: GLOBAL_CONFIG.commentBarrageConfig.accessToken,
    mailMd5: GLOBAL_CONFIG.commentBarrageConfig.mailMd5,
    pageUrl: window.location.pathname,
    barrageTimer: [],
    barrageList: [],
    barrageIndex: 0,
    dom: document.querySelector(".comment-barrage"),
  };
  var commentInterval = null;
  var hoverOnCommentBarrage = false;

  document.querySelector(".comment-barrage").addEventListener("mouseenter", function () {
    hoverOnCommentBarrage = true;
  });
  document.querySelector(".comment-barrage").addEventListener("mouseleave", function () {
    hoverOnCommentBarrage = false;
  });

  function initCommentBarrage() {
    if (!commentBarrageConfig.dom) return;

    var data = JSON.stringify({
      event: "COMMENT_GET",
      "commentBarrageConfig.accessToken": commentBarrageConfig.accessToken,
      url: commentBarrageConfig.pageUrl,
    });
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.addEventListener("readystatechange", function () {
      if (this.readyState === 4 && this.responseText) {
        commentBarrageConfig.barrageList = commentLinkFilter(JSON.parse(this.responseText).data);
        commentBarrageConfig.dom.innerHTML = "";
      }
    });
    xhr.open("POST", commentBarrageConfig.twikooUrl);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(data);

    clearInterval(commentInterval);
    commentInterval = null;

    commentInterval = setInterval(() => {
      if (commentBarrageConfig.barrageList.length && !hoverOnCommentBarrage) {
        popCommentBarrage(commentBarrageConfig.barrageList[commentBarrageConfig.barrageIndex]);
        commentBarrageConfig.barrageIndex += 1;
        commentBarrageConfig.barrageIndex %= commentBarrageConfig.barrageList.length;
      }
      if (
        commentBarrageConfig.barrageTimer.length >
          (commentBarrageConfig.barrageList.length > commentBarrageConfig.maxBarrage
            ? commentBarrageConfig.maxBarrage
            : commentBarrageConfig.barrageList.length) &&
        !hoverOnCommentBarrage
      ) {
        removeCommentBarrage(commentBarrageConfig.barrageTimer.shift());
      }
    }, commentBarrageConfig.barrageTime);
  }

  function commentLinkFilter(data) {
    data.sort((a, b) => {
      return a.created - b.created;
    });
    let newData = [];
    data.forEach(item => {
      newData.push(...getCommentReplies(item));
    });
    return newData;
  }

  function getCommentReplies(item) {
    if (item.replies) {
      let replies = [item];
      item.replies.forEach(item => {
        replies.push(...getCommentReplies(item));
      });
      return replies;
    } else {
      return [];
    }
  }

  // Twikoo 返回的是已渲染评论 HTML：白名单消毒（去脚本/事件/危险协议），
  // 保留正文排版与 tk-owo-emotion 图片（下方还会做【代码】/【图片】替换）。
  function sanitizeCommentHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    doc.body.querySelectorAll("script, style, iframe, object, embed, link, meta, form").forEach(el => el.remove());
    doc.body.querySelectorAll("*").forEach(el => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const isUrlAttr = name === "href" || name === "src" || name === "xlink:href";
        const value = String(attr.value).replace(/[\u0000-\u0020\u00a0]+/g, "").toLowerCase();
        if (name.startsWith("on") || (isUrlAttr && /^(?:javascript|vbscript|data:text\/html)/.test(value))) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  }

  function popCommentBarrage(data) {
    const esc = str => anzhiyu.escapeHtml(str);
    const mailMd5 = esc(String(data.mailMd5 ?? "").replace(/[^a-fA-F0-9]/g, ""));
    const isBlogger = data.mailMd5 === commentBarrageConfig.mailMd5;
    let barrage = document.createElement("div");
    barrage.className = "comment-barrage-item";
    barrage.innerHTML = `
          <div class="barrageHead">
            <a class="barrageTitle ${
              isBlogger ? "barrageBloggerTitle" : ""
            }" href="javascript:anzhiyu.scrollTo('#post-comment')">
              ${isBlogger ? "博主" : "热评"}
            </a>
            <div class="barrageNick">${esc(data.nick)}</div>
            <img class="nolazyload barrageAvatar" src="https://cravatar.cn/avatar/${mailMd5}"/>
            <a class="comment-barrage-close" href="javascript:anzhiyu.switchCommentBarrage()"><i class="anzhiyufont anzhiyu-icon-xmark"></i></a>
          </div>
          <anzhiyu class="barrageContent" onClick="window.location.hash = '${String(data.id ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/</g, "&lt;")}'">
            ${sanitizeCommentHtml(data.comment)}
          </anzhiyu>
        `;

    // 获取anzhiyu标签内的所有pre元素
    let anzhiyuPres = barrage.querySelectorAll("anzhiyu pre");

    // 遍历每个pre元素，将其替换为"【代码】"
    anzhiyuPres.forEach(pre => {
      let codePlaceholder = document.createElement("span");
      codePlaceholder.innerText = "【代码】";
      pre.parentNode.replaceChild(codePlaceholder, pre);
    });

    // 获取anzhiyu标签内的所有图片元素
    let anzhiyuImages = barrage.querySelectorAll("anzhiyu img");

    // 遍历每个图片元素，将其替换为"【图片】"，但排除带有class=tk-owo-emotion的图片
    anzhiyuImages.forEach(image => {
      if (!image.classList.contains("tk-owo-emotion")) {
        image.style.display = "none"; // 隐藏图片
        let placeholder = document.createElement("span");
        placeholder.innerText = "【图片】";
        image.parentNode.replaceChild(placeholder, image);
      }
    });
    commentBarrageConfig.barrageTimer.push(barrage);
    commentBarrageConfig.dom.append(barrage);
  }

  function removeCommentBarrage(barrage) {
    barrage.className = "comment-barrage-item out";

    setTimeout(() => {
      if (commentBarrageConfig.dom && commentBarrageConfig.dom.contains(barrage)) {
        commentBarrageConfig.dom.removeChild(barrage);
      }
    }, 1000);
  }

  // 自动隐藏
  const commentEntryCallback = entries => {
    const commentBarrage = document.querySelector(".comment-barrage");
    const postComment = document.getElementById("post-comment");

    entries.forEach(entry => {
      if (postComment && commentBarrage && document.body.clientWidth > 768) {
        commentBarrage.style.bottom = entry.isIntersecting ? `-${commentBarrageConfig.maxBarrage * 200}px` : "0";
      }
    });
  };
  // 创建IntersectionObserver实例
  const observer = new IntersectionObserver(commentEntryCallback, {
    root: null,
    rootMargin: "0px",
    threshold: 0,
  });
  // 监视目标元素
  const postCommentTarget = document.getElementById("post-comment");
  if (postCommentTarget) {
    observer.observe(postCommentTarget);
  }

  initCommentBarrage();

  if (localStorage.getItem("commentBarrageSwitch") !== "false") {
    document.querySelector(".comment-barrage").style.display = "flex";
    document.querySelector(".menu-commentBarrage-text").textContent = "关闭热评";
  } else {
    document.querySelector(".comment-barrage").style.display = "none";
    document.querySelector(".menu-commentBarrage-text").textContent = "显示热评";
  }

  // ── 生命周期（fix-plan 3.3.3）──────────────────────────────────────────
  // 本脚本 data-pjax 换页重执行：var commentInterval 会被重新初始化成 null，
  // 旧 interval 直接泄漏。换页（astro:before-swap / pjax:send）与新实例启动时
  // 统一收掉 interval 与 IntersectionObserver。
  function destroyCommentBarrage() {
    if (commentInterval) {
      clearInterval(commentInterval);
      commentInterval = null;
    }
    observer.disconnect();
    if (window.__anzhiyuCommentBarrageCleanup === destroyCommentBarrage) {
      window.__anzhiyuCommentBarrageCleanup = null;
    }
  }
  if (typeof window.__anzhiyuCommentBarrageCleanup === "function") {
    window.__anzhiyuCommentBarrageCleanup();
  }
  window.__anzhiyuCommentBarrageCleanup = destroyCommentBarrage;
  window.addEventListener("astro:before-swap", destroyCommentBarrage, { once: true });
  document.addEventListener("pjax:send", destroyCommentBarrage, { once: true });
}
