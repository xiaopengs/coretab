# 图标准备指南

CoreTab 需要以下尺寸的 PNG 图标文件，请将图标放入 `icons/` 目录：

## 必需图标

| 尺寸 | 文件名 | 用途 |
|------|--------|------|
| 16x16 | icon16.png | 工具栏小图标 |
| 48x48 | icon48.png | 扩展管理页面 |
| 128x128 | icon128.png | Chrome 应用商店 |

## 推荐设计

### 设计原则
- 简洁清晰，易于识别
- 主题：标签页 + 保存/恢复
- 建议使用蓝色主色调（#1a73e8）

### 简单设计示例

```
┌─────────────────────────┐
│  ████  ████  ████     │
│  ████  ████  ████     │
│         ✓             │
└─────────────────────────┘
```

### 颜色参考
- 主色：#1a73e8 (Google Blue)
- 辅色：#34a853 (绿色，成功/保存)
- 背景：#ffffff (白色)
- 文字：#333333 (深灰)

## 快速生成

你可以通过以下方式生成图标：

### 1. 在线工具
- [Favicon.io](https://favicon.io/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

### 2. 使用 ImageMagick
```bash
# 安装 ImageMagick 后
convert -size 128x128 xc:#1a73e8 -fill white -draw "rectangle 20,30 108,42" -draw "rectangle 20,50 108,62" -draw "rectangle 20,70 108,82" -draw "rectangle 20,90 80,102" icons/icon128.png
```

### 3. 使用 Python PIL
```python
from PIL import Image, ImageDraw

# 创建 128x128 图标
img = Image.new('RGB', (128, 128), '#1a73e8')
draw = ImageDraw.Draw(img)

# 绘制标签页形状
draw.rectangle([20, 30, 108, 42], fill='white')
draw.rectangle([20, 50, 108, 62], fill='white', outline='white')
draw.rectangle([20, 70, 108, 82], fill='white', outline='white')
draw.rectangle([20, 90, 80, 102], fill='white', outline='white')

# 保存不同尺寸
img.save('icons/icon128.png')
img.resize((48, 48)).save('icons/icon48.png')
img.resize((16, 16)).save('icons/icon16.png')
```

### 4. 使用在线 PNG 生成器
访问 https://pngimg.com/ 或其他 PNG 生成网站

## 临时解决方案

如果暂时没有图标，可以：

1. **使用 SVG**（仅限开发模式）
   - 将 `icon.svg` 复制为 `icon128.png` 作为占位符
   - Chrome 会显示为空白或默认图标

2. **从其他扩展复制**
   - 找到任意一个 Chrome 扩展的图标
   - 复制到 `icons/` 目录

## 验证

安装扩展后，检查以下位置：
- 工具栏图标
- 扩展管理页面 (chrome://extensions/)
- Chrome 应用商店（发布时）

---

## 注意

发布到 Chrome 应用商店时，128x128 图标是**必需**的，否则无法提交审核。
