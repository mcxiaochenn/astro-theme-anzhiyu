// 初始化函数
rm = {};

// 右键菜单相关节点可能整块 / 个别缺失：显隐、取尺寸、绑事件统一走空值安全包装
// （fix-plan 3.2.5），任何一个 id 缺失都不允许抛 TypeError 打断 refreshFn。
function rmSetDisplay(el, value) {
  if (el) el.style.display = value;
}
function rmBindById(id, type, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(type, handler);
  return el;
}
function rmGet(id) {
  return document.getElementById(id);
}

//禁止图片与超链接拖拽
let aElements = document.getElementsByTagName("a");
for (let i = 0; i < aElements.length; i++) {
  aElements[i].setAttribute("draggable", "false");
  let imgElements = aElements[i].getElementsByTagName("img");
  for (let j = 0; j < imgElements.length; j++) {
    imgElements[j].setAttribute("draggable", "false");
  }
}

// 显示菜单
rm.showRightMenu = function (isTrue, x = 0, y = 0) {
  console.info(x, y);
  let rightMenu = rmGet("rightMenu");
  if (!rightMenu) return;
  rightMenu.style.top = x + "px";
  rightMenu.style.left = y + "px";
  if (isTrue) {
    rightMenu.style.display = "block";
    stopMaskScroll();
  } else {
    rightMenu.style.display = "none";
  }
};

// 隐藏菜单
rm.hideRightMenu = function () {
  rm.showRightMenu(false);
  let rightMenuMask = document.querySelector("#rightmenu-mask");
  if (rightMenuMask) rightMenuMask.style.display = "none";
};

// 尺寸
let rmWidth = rmGet("rightMenu") ? rmGet("rightMenu").offsetWidth : 0;
let rmHeight = rmGet("rightMenu") ? rmGet("rightMenu").offsetHeight : 0;

// 重新定义尺寸
rm.reloadrmSize = function () {
  const rightMenu = rmGet("rightMenu");
  if (!rightMenu) return;
  rightMenu.style.visibility = "hidden";
  rightMenu.style.display = "block";
  // 获取宽度和高度
  rmWidth = rightMenu.offsetWidth;
  rmHeight = rightMenu.offsetHeight;
  rightMenu.style.visibility = "visible";
};

// 获取点击的href
let domhref = "";
let domImgSrc = "";
let globalEvent = null;

var oncontextmenuFunction = function (event) {
  if (document.body.clientWidth > 768) {
    let pageX = event.clientX + 10; //加10是为了防止显示时鼠标遮在菜单上
    let pageY = event.clientY;

    //其他额外菜单
    const $rightMenuOther = document.querySelector(".rightMenuOther");
    const $rightMenuPlugin = document.querySelector(".rightMenuPlugin");
    const $rightMenuCopyText = document.querySelector("#menu-copytext");
    const $rightMenuPasteText = document.querySelector("#menu-pastetext");
    const $rightMenuCommentText = document.querySelector("#menu-commenttext");
    const $rightMenuNewWindow = document.querySelector("#menu-newwindow");
    const $rightMenuNewWindowImg = document.querySelector("#menu-newwindowimg");
    const $rightMenuCopyLink = document.querySelector("#menu-copylink");
    const $rightMenuCopyImg = document.querySelector("#menu-copyimg");
    const $rightMenuDownloadImg = document.querySelector("#menu-downloadimg");
    const $rightMenuSearch = document.querySelector("#menu-search");
    const $rightMenuSearchBaidu = document.querySelector("#menu-searchBaidu");
    const $rightMenuMusicToggle = document.querySelector("#menu-music-toggle");
    const $rightMenuMusicBack = document.querySelector("#menu-music-back");
    const $rightMenuMusicForward = document.querySelector("#menu-music-forward");
    const $rightMenuMusicPlaylist = document.querySelector("#menu-music-playlist");
    const $rightMenuMusicCopyMusicName = document.querySelector("#menu-music-copyMusicName");

    let href = event.target.href;
    // 改进图片检测：检查当前元素或向上查找最近的图片元素
    let imgsrc = event.target.currentSrc;
    if (!imgsrc) {
      // 如果当前元素不是图片，尝试查找子元素或父元素中的图片
      const imgElement =
        event.target.tagName === "IMG"
          ? event.target
          : event.target.querySelector("img") || event.target.closest("img");
      if (imgElement) {
        imgsrc = imgElement.currentSrc || imgElement.src;
      }
    }

    // 判断模式 扩展模式为有事件
    let pluginMode = false;
    rmSetDisplay($rightMenuOther, "block");
    globalEvent = event;

    // 检查是否需要复制 是否有选中文本
    if (selectTextNow && window.getSelection()) {
      pluginMode = true;
      rmSetDisplay($rightMenuCopyText, "block");
      rmSetDisplay($rightMenuCommentText, "block");
      rmSetDisplay($rightMenuSearch, "block");
      rmSetDisplay($rightMenuSearchBaidu, "block");
    } else {
      rmSetDisplay($rightMenuCopyText, "none");
      rmSetDisplay($rightMenuCommentText, "none");
      rmSetDisplay($rightMenuSearchBaidu, "none");
      rmSetDisplay($rightMenuSearch, "none");
    }

    //检查是否右键点击了链接a标签
    if (href) {
      pluginMode = true;
      rmSetDisplay($rightMenuNewWindow, "block");
      rmSetDisplay($rightMenuCopyLink, "block");
      domhref = href;
    } else {
      rmSetDisplay($rightMenuNewWindow, "none");
      rmSetDisplay($rightMenuCopyLink, "none");
    }

    //检查是否需要复制图片
    if (imgsrc) {
      pluginMode = true;
      rmSetDisplay($rightMenuCopyImg, "block");
      rmSetDisplay($rightMenuDownloadImg, "block");
      rmSetDisplay($rightMenuNewWindowImg, "block");
      const $rightMenuEl = rmGet("rightMenu");
      if ($rightMenuEl) $rightMenuEl.style.width = "12rem";
      domImgSrc = imgsrc;
    } else {
      rmSetDisplay($rightMenuCopyImg, "none");
      rmSetDisplay($rightMenuDownloadImg, "none");
      rmSetDisplay($rightMenuNewWindowImg, "none");
    }

    // 判断是否为输入框
    if (event.target.tagName.toLowerCase() === "input" || event.target.tagName.toLowerCase() === "textarea") {
      pluginMode = true;
      rmSetDisplay($rightMenuPasteText, "block");
    } else {
      rmSetDisplay($rightMenuPasteText, "none");
    }
    const navMusicEl = document.querySelector("#nav-music");
    //判断是否是音乐
    if (navMusicEl && navMusicEl.contains(event.target)) {
      pluginMode = true;
      rmSetDisplay($rightMenuMusicToggle, "block");
      rmSetDisplay($rightMenuMusicBack, "block");
      rmSetDisplay($rightMenuMusicForward, "block");
      rmSetDisplay($rightMenuMusicPlaylist, "block");
      rmSetDisplay($rightMenuMusicCopyMusicName, "block");
    } else {
      rmSetDisplay($rightMenuMusicToggle, "none");
      rmSetDisplay($rightMenuMusicBack, "none");
      rmSetDisplay($rightMenuMusicForward, "none");
      rmSetDisplay($rightMenuMusicPlaylist, "none");
      rmSetDisplay($rightMenuMusicCopyMusicName, "none");
    }

    // 如果不是扩展模式则隐藏扩展模块
    if (pluginMode) {
      rmSetDisplay($rightMenuOther, "none");
      rmSetDisplay($rightMenuPlugin, "block");
    } else {
      rmSetDisplay($rightMenuPlugin, "none");
    }

    rm.reloadrmSize();

    // 鼠标默认显示在鼠标右下方，当鼠标靠右或靠下时，将菜单显示在鼠标左方\上方
    if (pageX + rmWidth > window.innerWidth) {
      pageX -= rmWidth + 10;
    }
    if (pageY + rmHeight > window.innerHeight) {
      pageY -= pageY + rmHeight - window.innerHeight;
    }

    rm.showRightMenu(true, pageY, pageX);
    rmSetDisplay(rmGet("rightmenu-mask"), "flex");
    return false;
  }
};

// 监听右键初始化
window.oncontextmenu = oncontextmenuFunction;

// 下载图片状态
rm.downloadimging = false;

// 复制图片到剪贴板
rm.writeClipImg = async function (imgsrc) {
  console.log("按下复制");
  rm.hideRightMenu();

  if (rm.downloadimging) {
    anzhiyu.snackbarShow("正在处理中，请稍候...");
    return;
  }

  rm.downloadimging = true;
  anzhiyu.snackbarShow("正在复制图片，请稍后...", false, 5000);

  try {
    await copyImage(imgsrc);
    anzhiyu.snackbarShow("复制成功！图片已添加盲水印，请遵守版权协议");
  } catch (error) {
    console.error("复制图片失败:", error);
    anzhiyu.snackbarShow("复制失败，请尝试右键另存为图片");
  } finally {
    rm.downloadimging = false;
  }
};

function imageToBlob(imageURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");

    // 设置跨域属性，允许从其他域加载图片
    img.crossOrigin = "anonymous";

    img.onload = function () {
      try {
        c.width = this.naturalWidth;
        c.height = this.naturalHeight;
        ctx.drawImage(this, 0, 0);
        c.toBlob(
          blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("无法创建图片 Blob"));
            }
          },
          "image/png",
          1
        );
      } catch (e) {
        reject(new Error("处理图片时出错: " + e.message));
      }
    };

    img.onerror = function () {
      reject(new Error("图片加载失败，可能是跨域限制"));
    };

    img.src = imageURL;
  });
}

async function copyImage(imageURL) {
  const blob = await imageToBlob(imageURL);
  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}

rm.copyUrl = function (id) {
  const input = document.createElement("input"); // Create a new <input> element
  input.id = "copyVal"; // Set the id of the new element to "copyVal"
  document.body.appendChild(input); // Append the new element to the end of the <body> element

  const text = id;
  input.value = text;
  input.select();
  input.setSelectionRange(0, input.value.length);
  document.execCommand("copy");

  input.remove(); // Remove the <input> element from the DOM
};

function stopMaskScroll() {
  // fix-plan 3.3.4：showRightMenu 每次弹菜单都会调进来，listener 只绑一次，
  // 否则 wheel 监听逐次叠加（hideRightMenu 被连环触发）。
  if (stopMaskScroll.bound) return;
  stopMaskScroll.bound = true;
  if (document.getElementById("rightmenu-mask")) {
    let xscroll = document.getElementById("rightmenu-mask");
    xscroll.addEventListener(
      "mousewheel",
      function (e) {
        //阻止浏览器默认方法
        rm.hideRightMenu();
        // e.preventDefault();
      },
      { passive: true }
    );
  }
  if (document.getElementById("rightMenu")) {
    let xscroll = document.getElementById("rightMenu");
    xscroll.addEventListener(
      "mousewheel",
      function (e) {
        //阻止浏览器默认方法
        rm.hideRightMenu();
        // e.preventDefault();
      },
      { passive: true }
    );
  }
}

rm.rightmenuCopyText = function (txt) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt);
  }
  rm.hideRightMenu();
};

rm.copyPageUrl = function (url) {
  if (!url) {
    url = window.location.href;
  }
  rm.copyUrl(url);
  anzhiyu.snackbarShow("复制链接地址成功", false, 2000);
  rm.hideRightMenu();
};

// 复制当前选中文本
var selectTextNow = "";
document.onmouseup = document.ondblclick = selceText;

function selceText() {
  var txt;
  if (document.selection) {
    txt = document.selection.createRange().text;
  } else {
    txt = window.getSelection().toString();
  }
  selectTextNow = txt !== "" ? txt : "";
}

// 读取剪切板
rm.readClipboard = function () {
  if (navigator.clipboard) {
    navigator.clipboard.readText().then(clipText => rm.insertAtCaret(globalEvent.target, clipText));
  }
};

// 粘贴文本到焦点
rm.insertAtCaret = function (elemt, value) {
  const startPos = elemt.selectionStart,
    endPos = elemt.selectionEnd;
  if (document.selection) {
    elemt.focus();
    var sel = document.selection.createRange();
    sel.text = value;
    elemt.focus();
  } else {
    if (startPos || startPos == "0") {
      var scrollTop = elemt.scrollTop;
      elemt.value = elemt.value.substring(0, startPos) + value + elemt.value.substring(endPos, elemt.value.length);
      elemt.focus();
      elemt.selectionStart = startPos + value.length;
      elemt.selectionEnd = startPos + value.length;
      elemt.scrollTop = scrollTop;
    } else {
      elemt.value += value;
      elemt.focus();
    }
  }
};

//粘贴文本
rm.pasteText = function () {
  const result = rm.readClipboard() || "";
  rm.hideRightMenu();
};

//引用到评论
rm.rightMenuCommentText = function (txt) {
  rm.hideRightMenu();
  const postCommentDom = document.getElementById("post-comment");
  if (!postCommentDom) return;
  var domTop = postCommentDom.offsetTop;
  window.scrollTo(0, domTop - 80);
  if (txt == "undefined" || txt == "null") txt = "好棒！";
  function setText(retries = 0) {
    setTimeout(() => {
      var input = document.getElementsByClassName("el-textarea__inner")[0];
      if (!input) {
        // 评论框可能还没挂载：有限重试，不能无限 setTimeout 自我循环
        if (retries < 20) setText(retries + 1);
        return;
      }
      let evt = document.createEvent("HTMLEvents");
      evt.initEvent("input", true, true);
      let inputValue = replaceAll(txt, "\n", "\n> ");
      input.value = "> " + inputValue + "\n\n";
      input.dispatchEvent(evt);
      input.focus();
      input.setSelectionRange(-1, -1);
      if (document.getElementById("comment-tips")) {
        document.getElementById("comment-tips").classList.add("show");
      }
    }, 100);
  }
  setText();
};

//替换所有内容
function replaceAll(string, search, replace) {
  return string.split(search).join(replace);
}

// 百度搜索
rm.searchBaidu = function () {
  anzhiyu.snackbarShow("即将跳转到百度搜索", false, 2000);
  setTimeout(function () {
    window.open("https://www.baidu.com/s?wd=" + selectTextNow);
  }, "2000");
  rm.hideRightMenu();
};

//分享链接
rm.copyLink = function () {
  rm.rightmenuCopyText(domhref);
  anzhiyu.snackbarShow("已复制链接地址");
};

function addRightMenuClickEvent() {
  // 添加点击事件（所有菜单项逐一判空后绑定，缺节点不抛错）
  rmBindById("menu-backward", "click", function () {
    window.history.back();
    rm.hideRightMenu();
  });

  rmBindById("menu-forward", "click", function () {
    window.history.forward();
    rm.hideRightMenu();
  });

  rmBindById("menu-refresh", "click", function () {
    window.location.reload();
  });

  rmBindById("menu-top", "click", function () {
    anzhiyu.scrollToDest(0, 500);
    rm.hideRightMenu();
  });

  rmBindById("menu-translate", "click", function () {
    window.translateFn.translatePage();
    rm.hideRightMenu();
  });

  const menuLinks = document.querySelectorAll(".menu-link");
  menuLinks.forEach(function (link) {
    link.addEventListener("click", rm.hideRightMenu);
  });

  rmBindById("menu-home", "click", function () {
    window.location.href = window.location.origin;
  });

  rmBindById("menu-randomPost", "click", function () {
    toRandomPost();
  });

  rmBindById("menu-commentBarrage", "click", anzhiyu.switchCommentBarrage);

  rmBindById("rightmenu-mask", "click", rm.hideRightMenu);

  rmBindById("rightmenu-mask", "contextmenu", function (event) {
    rm.hideRightMenu();
    event.preventDefault(); // Prevent the default context menu from appearing
  });

  rmBindById("menu-copy", "click", () => {
    rm.copyPageUrl();
  });

  rmBindById("menu-pastetext", "click", rm.pasteText);

  rmBindById("menu-copytext", "click", function () {
    rm.rightmenuCopyText(selectTextNow);
    const copyright = GLOBAL_CONFIG.copyright;
    if (copyright.copy) {
      anzhiyu.snackbarShow(copyright.languages.copySuccess);
    }
  });

  rmBindById("menu-commenttext", "click", function () {
    rm.rightMenuCommentText(selectTextNow);
  });

  rmBindById("menu-newwindow", "click", function () {
    window.open(domhref, "_blank");
    rm.hideRightMenu();
  });

  rmBindById("menu-copylink", "click", rm.copyLink);

  rmBindById("menu-downloadimg", "click", function () {
    anzhiyu.downloadImage(domImgSrc, "anzhiyu");
  });

  rmBindById("menu-newwindowimg", "click", function () {
    window.open(domImgSrc, "_blank");
    rm.hideRightMenu();
  });

  rmBindById("menu-copyimg", "click", function () {
    rm.writeClipImg(domImgSrc);
  });

  rmBindById("menu-searchBaidu", "click", rm.searchBaidu);

  //音乐
  rmBindById("menu-music-toggle", "click", anzhiyu.musicToggle);

  rmBindById("menu-music-back", "click", anzhiyu.musicSkipBack);

  rmBindById("menu-music-forward", "click", anzhiyu.musicSkipForward);

  rmBindById("menu-music-copyMusicName", "click", function () {
    rm.rightmenuCopyText(anzhiyu.musicGetName());
    anzhiyu.snackbarShow("复制歌曲名称成功", false, 3000);
  });
}

addRightMenuClickEvent();
