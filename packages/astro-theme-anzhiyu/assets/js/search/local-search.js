window.addEventListener("load", () => {
  let loadFlag = false;
  let dataObj = [];
  // `#search-mask` 属于 Search 组件子树，ClientRouter 换页即被替换 —— 取值必须
  // 每次现查；首屏缓存旧节点会让换页后遮罩永远显示不出来（animateIn 到已丢弃节点）。
  const searchMask = () => document.getElementById("search-mask");

  // shortcut: ESC —— 命名 handler 统一绑定/解绑，openSearch 反复打开不叠加，
  // closeSearch（点 X / 点 mask / 换页）都要把 document 上的监听摘掉。
  const onSearchEscKeydown = event => {
    if (event.code === "Escape") closeSearch();
  };

  const openSearch = () => {
    const bodyStyle = document.body.style;
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    anzhiyu.animateIn(searchMask(), "to_show 0.5s");
    anzhiyu.animateIn(document.querySelector("#local-search .search-dialog"), "titleScale 0.5s");
    setTimeout(() => {
      const $input = document.querySelector("#local-search-input input");
      $input && $input.focus();
    }, 100);
    if (!loadFlag) {
      search();
      loadFlag = true;
    }
    document.addEventListener("keydown", onSearchEscKeydown);
  };

  const closeSearch = () => {
    const bodyStyle = document.body.style;
    bodyStyle.width = "";
    bodyStyle.overflow = "";
    anzhiyu.animateOut(document.querySelector("#local-search .search-dialog"), "search_close .5s");
    anzhiyu.animateOut(searchMask(), "to_hide 0.5s");
    document.removeEventListener("keydown", onSearchEscKeydown);
  };

  const searchClickFn = () => {
    // `#search-button` 在 Header 子树（换页被替换），每次导航后对新节点重绑。
    const $searchButton = document.querySelector("#search-button > .search");
    if ($searchButton) $searchButton.addEventListener("click", openSearch);
    // `#menu-search` 在 transition:persist 的 #rightMenu 里，全站只绑一次；
    // 每次 pjax:complete 重绑会在常驻节点上逐页叠加 openSearch。
    const $menuSearch = document.getElementById("menu-search");
    if ($menuSearch && !$menuSearch.dataset.searchBound) {
      $menuSearch.dataset.searchBound = "1";
      $menuSearch.addEventListener("click", openSearch);
    }
  };

  const searchDialogFn = () => {
    // 弹层节点带 data-astro-transition-persist（常驻，同上游 pjax 语义）；这里仍做
    // 幂等重绑兜底（dataset 防叠加），站点未启用常驻或弹层被重建时同样成立。
    const $closeButton = document.querySelector("#local-search .search-close-button");
    if ($closeButton && !$closeButton.dataset.closeBound) {
      $closeButton.dataset.closeBound = "1";
      $closeButton.addEventListener("click", closeSearch);
    }
    const $mask = searchMask();
    if ($mask && !$mask.dataset.closeBound) {
      $mask.dataset.closeBound = "1";
      $mask.addEventListener("click", closeSearch);
    }
  };

  // check url is json or not
  const isJson = url => {
    const reg = /\.json$/;
    return reg.test(url);
  };

  const fetchData = async path => {
    let data = [];
    const response = await fetch(path);
    if (isJson(path)) {
      data = await response.json();
    } else {
      const res = await response.text();
      const t = await new window.DOMParser().parseFromString(res, "text/xml");
      const a = await t;

      data = [...a.querySelectorAll("entry")].map(item => {
        let tagsArr = [];
        if (item.querySelector("tags") && item.querySelector("tags").getElementsByTagName("tag")) {
          Array.prototype.forEach.call(item.querySelector("tags").getElementsByTagName("tag"), function (item, index) {
            tagsArr.push(item.textContent);
          });
        }
        let content = item.querySelector("content") && item.querySelector("content").textContent;
        let imgReg = /<img.*?(?:>|\/>)/gi; //匹配图片中的img标签
        let srcReg = /src=[\'\"]?([^\'\"]*)[\'\"]?/i; // 匹配图片中的src
        let arr = content.match(imgReg); //筛选出所有的img

        let srcArr = [];
        if (arr) {
          for (let i = 0; i < arr.length; i++) {
            let src = arr[i].match(srcReg);
            // 获取图片地址（正则没匹配到时 src 为 null，不能直接取 [1]）
            if (src && !src[1].indexOf("http")) srcArr.push(src[1]);
          }
        }

        return {
          title: item.querySelector("title").textContent,
          content: content,
          url: item.querySelector("url").textContent,
          tags: tagsArr,
          oneImage: srcArr && srcArr[0],
        };
      });
    }
    if (response.ok) {
      const $loadDataItem = document.getElementById("loading-database");
      $loadDataItem.nextElementSibling.style.display = "block";
      $loadDataItem.remove();
    }
    return data;
  };

  // 输入框绑定：换页后 #local-search-input 可能是新节点，pjax:complete /
  // astro:page-load 重跑；dataset 防叠加；input 加防抖（每次按键全文检索）。
  const bindSearchInput = () => {
    const $input = document.querySelector("#local-search-input input");
    const $resultContent = document.getElementById("local-search-results");
    const $loadingStatus = document.getElementById("loading-status");
    if (!$input || !$resultContent) return;

    // 结果区点击走事件委托（替代内联 onclick），常驻节点只绑一次
    if ($resultContent && !$resultContent.dataset.clickBound) {
      $resultContent.dataset.clickBound = "1";
      $resultContent.addEventListener("click", event => {
        const item = event.target.closest("p.search-result[data-url]");
        if (!item) return;
        const url = item.dataset.url;
        if (window.pjax && window.pjax.loadUrl) window.pjax.loadUrl(url);
        else window.location.href = url;
      });
    }

    const doSearch = function () {
      const keywords = $input.value.trim().toLowerCase().split(/[\s]+/);
      if (keywords[0] !== "")
        $loadingStatus.innerHTML = '<i class="anzhiyufont anzhiyu-icon-spinner anzhiyu-pulse-icon"></i>';

      $resultContent.innerHTML = "";
      let str = '<div class="search-result-list">';
      if (keywords.length <= 0) return;
      let count = 0;
      // perform local searching
      dataObj.then(data => {
        data.forEach(data => {
          let isMatch = true;
          let dataTitle = data.title ? data.title.trim().toLowerCase() : "";
          let dataTags = data.tags;
          let oneImage = data.oneImage ?? "";
          const dataContent = data.content
            ? data.content
                .trim()
                .replace(/<[^>]+>/g, "")
                .toLowerCase()
            : "";
          const dataUrl = data.url.startsWith("/") ? data.url : GLOBAL_CONFIG.root + data.url;
          let indexTitle = -1;
          let indexContent = -1;
          let firstOccur = -1;
          // only match articles with not empty titles and contents
          if (dataTitle !== "" || dataContent !== "") {
            keywords.forEach((keyword, i) => {
              indexTitle = dataTitle.indexOf(keyword);
              indexContent = dataContent.indexOf(keyword);
              if (indexTitle < 0 && indexContent < 0) {
                isMatch = false;
              } else {
                if (indexContent < 0) {
                  indexContent = 0;
                }
                if (i === 0) {
                  firstOccur = indexContent;
                }
              }
            });
          } else {
            isMatch = false;
          }

          // show search results
          if (isMatch) {
            if (firstOccur >= 0) {
              // cut out 130 characters
              // let start = firstOccur - 30 < 0 ? 0 : firstOccur - 30
              // let end = firstOccur + 50 > dataContent.length ? dataContent.length : firstOccur + 50
              let start = firstOccur - 30;
              let end = firstOccur + 100;
              let pre = "";
              let post = "";

              if (start < 0) {
                start = 0;
              }

              if (start === 0) {
                end = 100;
              } else {
                pre = "...";
              }

              if (end > dataContent.length) {
                end = dataContent.length;
              } else {
                post = "...";
              }

              let matchContent = dataContent.substring(start, end);

              // 先转义再高亮：关键词里的正则元字符先转义，否则 new RegExp 会被
              // `(` `*` 之类的输入打崩或产生 ReDoS。
              matchContent = anzhiyu.escapeHtml(matchContent);
              const altText = anzhiyu.escapeHtml(dataTitle);
              dataTitle = anzhiyu.escapeHtml(dataTitle);
              keywords.forEach(keyword => {
                const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regS = new RegExp(safeKeyword, "gi");
                const mark = '<span class="search-keyword">' + anzhiyu.escapeHtml(keyword) + "</span>";
                matchContent = matchContent.replace(regS, mark);
                dataTitle = dataTitle.replace(regS, mark);
              });

              const safeUrl = anzhiyu.isSafeUrl(dataUrl) ? dataUrl : "#";
              const safeImage = anzhiyu.isSafeUrl(oneImage) ? oneImage : "";

              str += '<div class="local-search__hit-item">';
              if (safeImage) {
                str += `<div class="search-left"><img src="${anzhiyu.escapeHtml(safeImage)}" alt="${altText}" data-fancybox='gallery'>`;
              } else {
                str += '<div class="search-left" style="width:0">';
              }

              str += "</div>";

              if (safeImage) {
                str +=
                  '<div class="search-right"><a href="' +
                  anzhiyu.escapeHtml(safeUrl) +
                  '" class="search-result-title">' +
                  dataTitle +
                  "</a>";
              } else {
                str +=
                  '<div class="search-right" style="width: 100%"><a href="' +
                  anzhiyu.escapeHtml(safeUrl) +
                  '" class="search-result-title">' +
                  dataTitle +
                  "</a>";
              }

              count += 1;

              if (dataContent !== "") {
                // 内联 onclick 拼 URL 会把引号/反引号注入事件代码：改为 data-url + 事件委托
                str +=
                  '<p class="search-result" data-url="' +
                  anzhiyu.escapeHtml(safeUrl) +
                  '">' +
                  pre +
                  matchContent +
                  post +
                  "</p>";
              }
              if (dataTags.length) {
                str += '<div class="search-result-tags">';

                for (let i = 0; i < dataTags.length; i++) {
                  const element = dataTags[i].trim();

                  str +=
                    '<a class="tag-list" href="' +
                    anzhiyu.escapeHtml(anzhiyu.rootUrl("/tags/" + element + "/")) +
                    '" data-pjax-state="" one-link-mark="yes">#' +
                    anzhiyu.escapeHtml(element) +
                    "</a>";
                }

                str += "</div>";
              }
            }
            str += "</div></div>";
          }
        });
        if (count === 0) {
          str +=
            '<div id="local-search__hits-empty">' +
            // 用户输入进 HTML：转义；用函数式替换避开 $& 等替换模式
            GLOBAL_CONFIG.localSearch.languages.hits_empty.replace(/\$\{query}/, () =>
              anzhiyu.escapeHtml($input.value.trim()),
            ) +
            "</div>";
        }
        str += "</div>";
        $resultContent.innerHTML = str;
        if (keywords[0] !== "") $loadingStatus.innerHTML = "";
        window.pjax && window.pjax.refresh($resultContent);
      });
    };

    if (!$input.dataset.searchBound) {
      $input.dataset.searchBound = "1";
      $input.addEventListener("input", anzhiyu.debounce(doSearch, 200));
    }
  };

  const search = () => {
    if (!GLOBAL_CONFIG.localSearch.preload) {
      dataObj = fetchData(GLOBAL_CONFIG.localSearch.path);
    }
    bindSearchInput();
  };

  searchClickFn();
  searchDialogFn();
  if (GLOBAL_CONFIG.localSearch.preload) dataObj = fetchData(GLOBAL_CONFIG.localSearch.path);

  // pjax
  // 换页前（pjax:send）搜索层还开着就先收起：mask 属于换页即被替换的子树，
  // 等 pjax:complete 时旧 mask 已丢弃、查不到「是否开着」，body 的滚动锁会残留。
  window.addEventListener("pjax:send", () => {
    const $mask = searchMask();
    if ($mask && !anzhiyu.isHidden($mask)) closeSearch();
  });
  window.addEventListener("pjax:complete", () => {
    searchClickFn();
    searchDialogFn();
    bindSearchInput();
  });
  window.addEventListener("astro:page-load", () => {
    searchClickFn();
    searchDialogFn();
    bindSearchInput();
  });
});
