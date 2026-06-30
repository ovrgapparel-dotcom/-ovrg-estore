const fs = require('fs');

['headwear.html', 'outerwear.html', 'showcase.html'].forEach(f => {
  let s = fs.readFileSync(f, 'utf8');
  const inj = `
window.setProductType = typeof setProductType !== "undefined" ? setProductType : undefined;
window.switchView = typeof switchView !== "undefined" ? switchView : undefined;
window.setShirtColor = typeof setShirtColor !== "undefined" ? setShirtColor : undefined;
window.openAdmin = typeof openAdmin !== "undefined" ? openAdmin : undefined;
window.closeAdmin = typeof closeAdmin !== "undefined" ? closeAdmin : undefined;
window.saveCustomText = typeof saveCustomText !== "undefined" ? saveCustomText : undefined;
window.selectPrint = typeof selectPrint !== "undefined" ? selectPrint : undefined;
window.switchProduct = typeof switchProduct !== "undefined" ? switchProduct : undefined;
</script>
</body>
</html>`;
  s = s.replace('</script>\r\n</body>\r\n</html>', inj);
  s = s.replace('</script>\n</body>\n</html>', inj);
  fs.writeFileSync(f, s);
});
