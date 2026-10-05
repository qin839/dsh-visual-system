# ─────────────────────────────────────────────────────────────────────────────
# 生成仓库自带的那张演示壁纸（极光），版权干净、可复现。
#
#   pwsh -NoProfile -File tools\make-demo-wallpaper.ps1
#   pwsh -NoProfile -File tools\make-demo-wallpaper.ps1 -Out presets\demo\assets\aurora.png -Width 2560 -Height 1440
#
# 只用 System.Drawing，不依赖任何外部素材或第三方库。
#
# 做法：光斑先画在 1/8 分辨率的小图上，再用高质量双三次插值放大回原尺寸 ——
# 这样得到的是柔和的极光带，而不是一堆能看出边界的椭圆。星星和底部压暗
# 仍然画在全分辨率上，保持锐利。
# ─────────────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [string]$Out = (Join-Path $PSScriptRoot '..\presets\demo\assets\aurora.png'),
    [int]$Width = 1920,
    [int]$Height = 1080,
    [int]$Seed = 20261005,
    [int]$BlurScale = 8
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outPath = [System.IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath) | Out-Null

$bitmap = New-Object System.Drawing.Bitmap $Width, $Height
$canvas = [System.Drawing.Graphics]::FromImage($bitmap)
$canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$canvas.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# ── 1. 低分辨率上画底色与极光 ──────────────────────────────────────────────
$lowWidth = [Math]::Max(32, [int]($Width / $BlurScale))
$lowHeight = [Math]::Max(32, [int]($Height / $BlurScale))
$low = New-Object System.Drawing.Bitmap $lowWidth, $lowHeight
$lowCanvas = [System.Drawing.Graphics]::FromImage($low)
$lowCanvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$lowRect = New-Object System.Drawing.Rectangle 0, 0, $lowWidth, $lowHeight
$skyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $lowRect,
    ([System.Drawing.Color]::FromArgb(255, 5, 8, 26)),
    ([System.Drawing.Color]::FromArgb(255, 22, 9, 36)), 90.0
$colorBlend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$colorBlend.Colors = @(
    [System.Drawing.Color]::FromArgb(255, 5, 8, 26),
    [System.Drawing.Color]::FromArgb(255, 10, 13, 40),
    [System.Drawing.Color]::FromArgb(255, 24, 10, 36))
$colorBlend.Positions = @(0.0, 0.58, 1.0)
$skyBrush.InterpolationColors = $colorBlend
$lowCanvas.FillRectangle($skyBrush, $lowRect)

function Add-LowGlow {
    param(
        [System.Drawing.Graphics]$Graphics,
        [single]$CenterX, [single]$CenterY,
        [single]$RadiusX, [single]$RadiusY,
        [System.Drawing.Color]$Color,
        [int]$Alpha
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($CenterX - $RadiusX, $CenterY - $RadiusY, $RadiusX * 2, $RadiusY * 2)
    $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
    $brush.CenterColor = [System.Drawing.Color]::FromArgb($Alpha, $Color)
    $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $Color))
    $Graphics.FillPath($brush, $path)
    $brush.Dispose(); $path.Dispose()
}

# 极光带：几条错落的光带，青 → 蓝紫 → 品红，外加地平线暖光
Add-LowGlow $lowCanvas ($lowWidth * 0.22) ($lowHeight * 0.26) ($lowWidth * 0.40) ($lowHeight * 0.20) ([System.Drawing.Color]::FromArgb(255, 60, 230, 190)) 150
Add-LowGlow $lowCanvas ($lowWidth * 0.44) ($lowHeight * 0.16) ($lowWidth * 0.34) ($lowHeight * 0.16) ([System.Drawing.Color]::FromArgb(255, 90, 200, 235)) 130
Add-LowGlow $lowCanvas ($lowWidth * 0.60) ($lowHeight * 0.24) ($lowWidth * 0.32) ($lowHeight * 0.18) ([System.Drawing.Color]::FromArgb(255, 120, 110, 255)) 135
Add-LowGlow $lowCanvas ($lowWidth * 0.80) ($lowHeight * 0.34) ($lowWidth * 0.28) ($lowHeight * 0.16) ([System.Drawing.Color]::FromArgb(255, 225, 95, 165)) 120
Add-LowGlow $lowCanvas ($lowWidth * 0.32) ($lowHeight * 0.40) ($lowWidth * 0.30) ($lowHeight * 0.14) ([System.Drawing.Color]::FromArgb(255, 40, 170, 200)) 90
Add-LowGlow $lowCanvas ($lowWidth * 0.50) ($lowHeight * 1.06) ($lowWidth * 0.52) ($lowHeight * 0.20) ([System.Drawing.Color]::FromArgb(255, 255, 170, 90)) 110
$lowCanvas.Dispose()

# ── 2. 放大回全分辨率（关键：让光斑变成柔和的光带）────────────────────────
$attributes = New-Object System.Drawing.Imaging.ImageAttributes
$attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$destRect = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
$canvas.DrawImage($low, $destRect, 0, 0, $lowWidth, $lowHeight, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
$low.Dispose(); $attributes.Dispose()

# ── 3. 星星（全分辨率，保持锐利；越靠下越暗）──────────────────────────────
$random = New-Object System.Random $Seed
$starBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
for ($i = 0; $i -lt 520; $i++) {
    $x = $random.NextDouble() * $Width
    $y = $random.NextDouble() * ($Height * 0.80)
    $size = 0.6 + $random.NextDouble() * 1.8
    $alpha = [int]((40 + $random.NextDouble() * 185) * (1.0 - ($y / $Height)))
    $starBrush.Color = [System.Drawing.Color]::FromArgb([Math]::Max(0, [Math]::Min(255, $alpha)), 255, 255, 255)
    $canvas.FillEllipse($starBrush, [single]$x, [single]$y, [single]$size, [single]$size)
}
$starBrush.Dispose()

# ── 4. 底部压暗，给界面内容留出阅读区 ──────────────────────────────────────
$fadeHeight = [int]($Height * 0.44)
$fade = New-Object System.Drawing.Rectangle 0, ($Height - $fadeHeight), $Width, $fadeHeight
$fadeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $fade,
    ([System.Drawing.Color]::FromArgb(0, 2, 4, 14)),
    ([System.Drawing.Color]::FromArgb(210, 2, 4, 14)), 90.0
$canvas.FillRectangle($fadeBrush, $fade)

$canvas.Dispose()
$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host ('已生成 {0}  ({1}x{2}, {3:N0} KB)' -f $outPath, $Width, $Height, ((Get-Item -LiteralPath $outPath).Length / 1KB))
