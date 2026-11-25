window.addEventListener("load", () => {
  let loadFlag = false;
  let dataObj = [];
  // `#search-mask` 属于 Search 组件子树，ClientRouter 换页即被替换 —— 取值必须
  // 每次现查；首屏缓存旧节点会让换页后遮罩永远显示不出来（animateIn 到已丢弃节点）。
  const searchMask = () => document.getElementById("search-mask");

  const openSearch = () => {
    const bodyStyle = document.body.style;
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    anzhiyu.animateIn(searchMask(), "to_show 0.5s");
    anzhiyu.animateIn(document.querySelector("#local-search .search-dialog"), "titleScale 0.5s");
    setTimeout(() => {
      document.querySelector("#local-search-input input").focus();
    }, 100);
    if (!loadFlag) {
      search();
      loadFlag = true;
    }
    // shortcut: ESC
    document.addEventListener("keydown", function f(event) {
      if (event.code === "Escape") {
        closeSearch();
        document.removeEventListener("keydown", f);
      }
    });
  };

  const closeSearch = () => {
    const bodyStyle = document.body.style;
    bodyStyle.width = "";
    bodyStyle.overflow = "";
    anzhiyu.animateOut(document.querySelector("#local-search .search-dialog"), "search_close .5s");
    anzhiyu.animateOut(searchMask(), "to_hide 0.5s");
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
            // 获取图片地址
            if (!src[1].indexOf("http")) srcArr.push(src[1]);
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

  const search = () => {
    if (!GLOBAL_CONFIG.localSearch.preload) {
      dataObj = fetchData(GLOBAL_CONFIG.localSearch.path);
    }
    const $input = document.querySelector("#local-search-input input");
    const $resultContent = document.getElementById("local-search-results");
    const $loadingStatus = document.getElementById("loading-status");

    $input.addEventListener("input", function () {
      const keywords = this.value.trim().toLowerCase().split(/[\s]+/);
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

              // highlight all keywords
              keywords.forEach(keyword => {
                const regS = new RegExp(keyword, "gi");
                matchContent = matchContent.replace(regS, '<span class="search-keyword">' + keyword + "</span>");
                dataTitle = dataTitle.replace(regS, '<span class="search-keyword">' + keyword + "</span>");
              });

              str += '<div class="local-search__hit-item">';
              if (oneImage) {
                str += `<div class="search-left"><img src=${oneImage} alt=${dataTitle} data-fancybox='gallery'>`;
              } else {
                str += '<div class="search-left" style="width:0">';
              }

              str += "</div>";

              if (oneImage) {
                str +=
                  '<div class="search-right"><a href="' +
                  dataUrl +
                  '" class="search-result-title">' +
                  dataTitle +
                  "</a>";
              } else {
                str +=
                  '<div class="search-right" style="width: 100%"><a href="' +
                  dataUrl +
                  '" class="search-result-title">' +
                  dataTitle +
                  "</a>";
              }

              count += 1;

              if (dataContent !== "") {
                str +=
                  '<p class="search-result" onclick="pjax.loadUrl(`' +
                  dataUrl +
                  '`)">' +
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
                    '<a class="tag-list" href="/tags/' +
                    element +
                    '/" data-pjax-state="" one-link-mark="yes">#' +
                    element +
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
            GLOBAL_CONFIG.localSearch.languages.hits_empty.replace(/\$\{query}/, this.value.trim()) +
            "</div>";
        }
        str += "</div>";
        $resultContent.innerHTML = str;
        if (keywords[0] !== "") $loadingStatus.innerHTML = "";
        window.pjax && window.pjax.refresh($resultContent);
      });
    });
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
  });
});
