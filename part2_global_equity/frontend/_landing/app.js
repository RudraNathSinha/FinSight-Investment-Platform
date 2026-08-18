(function () {
  var root = document.documentElement;
  var btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("finsight-theme", next); } catch (e) {}
    });
  }

  var c = window.FINSIGHT_CONFIG || {};
  function set(id, url) {
    var el = document.getElementById(id);
    if (el && url) el.href = url;
  }
  set("cta-part1", c.part1Url);
  set("cta-part2", c.part2Url);
  set("cta-part3", c.part3Url);
  set("cta-hero-equity", c.part2Url);
})();
