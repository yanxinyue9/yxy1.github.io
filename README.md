# 肠道菌群生态模拟器 · Gut Microbiome Simulator

2D 交互沙盒：模拟肠道菌群生态演化，可视化菌属组成、代谢小分子与宿主指标。

## 文件结构（全部平铺在仓库根目录）

```
index.html   入口，引用下方文件的相对路径
styles.css
data.js      菌种/食物/档案词典与科普文案
model.js     生态动力学模型
render.js    Canvas 肠腔渲染
ui.js        界面、弹窗科普、对比动图
app.js       主循环装配
.nojekyll    绕过 Jekyll
```

## 开启 GitHub Pages

Settings → Pages → Build and deployment
→ Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)` → Save

稍等 1～2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

> 仓库需为 **Public**；本地预览用 `python3 -m http.server 8080`。
> 注意：本仓库采用平铺结构，`index.html` 的引用路径已相应调整，
> 请勿把文件移入 `assets/` 子目录，否则会 404。
