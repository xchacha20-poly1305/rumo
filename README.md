# Rumo -- 如梦输入法

Rumo 在 GNOME 下提供接近原生移动端输入法的体验。

命名为谐音：Ru == "如"，mo == “梦”。同时也致敬了 rime。

# 安装

目前尚未发布到 GNOME Extensions，需从源码构建并安装。

## 环境要求

- GNOME Shell 51（Wayland）
- 运行中的 [Fcitx5](https://fcitx-im.org/)（通过 `InputContext1` D-Bus 接口通信）
- 构建工具：[Bun](https://bun.sh/)、`glib-compile-schemas`（GLib）、`msgfmt`（gettext）

## 从源码安装

```bash
git clone https://github.com/xchacha20-poly1305/rumo.git
cd rumo
bun install
bun run install-ext
```

`bun run install-ext` 会编译扩展并将文件安装到 `~/.local/share/gnome-shell/extensions/rumo@io.github.xchacha20-poly1305`。

安装完成后，**注销并重新登录**（Wayland 下需重新登录以重新加载 GNOME Shell），然后启用扩展：

```bash
gnome-extensions enable rumo@io.github.xchacha20-poly1305
```

也可以在「扩展（Extensions）」或 Extension Manager 应用中手动启用。

## 卸载

```bash
gnome-extensions disable rumo@io.github.xchacha20-poly1305
rm -rf ~/.local/share/gnome-shell/extensions/rumo@io.github.xchacha20-poly1305
```

## 自定义主题

默认情况下，Rumo 会自动跟随 GNOME 系统的深色/浅色外观（`color-scheme`）以及系统强调色（`accent-color`）。

如需自定义样式，可在 `~/.config/rumo/`（遵循 `XDG_CONFIG_HOME`）下放置以下文件，Rumo 会自动检测并支持保存即热重载；若配置存在错误，会在日志中输出警告并静默回退到默认样式（可通过 `journalctl -f -o cat /usr/bin/gnome-shell | grep Rumo` 查看）：

- `theme.json`：共享基础配置（预设、圆角、字体、背景图、通用配色等）
- `theme-light.json`：仅在系统为浅色模式时叠加的覆写配置
- `theme-dark.json`：仅在系统为深色模式时叠加的覆写配置
- `custom.css`：进阶 `St` CSS 覆写（最后加载，键盘根容器带有 `.rumo-mode-light` / `.rumo-mode-dark` 状态类）

合并优先级由低到高为：**内置预设 → `theme.json` → `theme-{light|dark}.json` → `custom.css`**。

内置预设（通过 `"extends"` 指定）：`dark`、`light`、`amoled`、`flat-dark`、`flat-light`。完整字段定义与编辑器自动补全可参考 [docs/theme.schema.json](./docs/theme.schema.json)。

### 配置示例

**1. 切换为纯黑 OLED 预设（`~/.config/rumo/theme.json`）**

```json
{
  "extends": "amoled"
}
```

**2. 保留跟随系统明暗，自定义圆角、字体与固定强调色（`~/.config/rumo/theme.json`）**

```json
{
  "geometry": {
    "keyRadius": 14,
    "keyBorder": true
  },
  "typography": {
    "fontFamily": "Inter, Noto Sans CJK SC",
    "fontScale": 1.05
  },
  "colors": {
    "accent": "#e06c75"
  }
}
```

**3. 自定义背景图与半透明按键（`~/.config/rumo/theme.json`）**

```json
{
  "background": {
    "image": "wallpaper.jpg",
    "size": "cover",
    "dim": 0.55
  },
  "colors": {
    "keyBackground": "rgba(40, 42, 50, 0.72)",
    "specialKeyBackground": "rgba(28, 30, 36, 0.78)"
  }
}
```

**4. 进阶 CSS 覆写（`~/.config/rumo/custom.css`）**

```css
.rumo-keyboard.rumo-mode-dark .rumo-key {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}
```

# 致谢

体验、设计以及布局参考了 [fcitx5-android](https://github.com/fcitx5-android/fcitx5-android)。

图标来自 [google/material-design-icons](https://github.com/google/material-design-icons)，它们是使用 [Apache 2.0](./icons/LICENSE) 发布的。

之所以产生开发这个项目的想法，是因为 [open-screen-sharing](https://github.com/nekohasekai/open-screen-sharing) 独特的品味只提供横屏操控。其他应用我还能使用竖屏+移动端自带 ime 苟且偷生，但在横屏下手机的 ime 会几乎占满整个屏幕，很难用。而 GNOME 自带的无障碍键盘不符合我的使用习惯，故模仿移动端输入法的操作逻辑制作此项目。

# 许可证

[GPL-2.0-or-later](./LICENSE) （基于 [GNOME shell 衍生作品的要求](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#licensing)）
