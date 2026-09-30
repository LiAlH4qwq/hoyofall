(function () {
  function add() {
    var buttons = document.querySelector(".right-buttons");
    if (!buttons || buttons.querySelector(".lang-switch")) {
      return;
    }
    var link = document.createElement("a");
    link.className = "lang-switch";
    link.href = "/hoyofall/en/";
    link.textContent = "English";
    buttons.insertBefore(link, buttons.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", add);
  } else {
    add();
  }
})();
