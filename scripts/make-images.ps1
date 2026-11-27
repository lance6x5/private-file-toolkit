# Renders Fileward's PNG icons and Open Graph preview images with
# System.Drawing (Windows PowerShell 5.1). The geometry matches
# public/logo-mark.svg (64x64 design grid).
#   powershell -ExecutionPolicy Bypass -File scripts/make-images.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$pub = Join-Path $root 'public'
$og = Join-Path $pub 'og'
New-Item -ItemType Directory -Force $og | Out-Null

function C([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Draw the mark's foreground (document + fold + shield + check) in the 64-grid.
function DrawGlyph($g) {
  $doc = New-Object System.Drawing.Drawing2D.GraphicsPath
  $doc.AddLine(20, 12, 37, 12)
  $doc.AddLine(37, 12, 48, 23)
  $doc.AddLine(48, 23, 48, 52)
  $doc.AddArc(42, 49, 6, 6, 0, 90)
  $doc.AddLine(45, 55, 20, 55)
  $doc.AddArc(17, 49, 6, 6, 90, 90)
  $doc.AddLine(17, 52, 17, 15)
  $doc.AddArc(17, 12, 6, 6, 180, 90)
  $doc.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#ffffff')), $doc)

  $fold = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fold.AddLine(37, 12, 37, 20)
  $fold.AddArc(37, 17, 6, 6, 180, -90)
  $fold.AddLine(40, 23, 48, 23)
  $fold.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#f4c3d6')), $fold)

  $sh = New-Object System.Drawing.Drawing2D.GraphicsPath
  $sh.AddLine(32.5, 27, 41.5, 30.4)
  $sh.AddLine(41.5, 30.4, 41.5, 36.8)
  $sh.AddBezier(41.5, 36.8, 41.5, 42.4, 37.7, 47.2, 32.5, 49)
  $sh.AddBezier(32.5, 49, 27.3, 47.2, 23.5, 42.4, 23.5, 36.8)
  $sh.AddLine(23.5, 36.8, 23.5, 30.4)
  $sh.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#9f1d4f')), $sh)

  $pen = New-Object System.Drawing.Pen (C '#ffffff'), 2.6
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $g.DrawLines($pen, [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF 28.5, 38.5),
      (New-Object System.Drawing.PointF 31.5, 41.5),
      (New-Object System.Drawing.PointF 37, 35.5)))
}

function BgBrush([float]$x, [float]$y, [float]$w, [float]$h) {
  New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF $x, $y, $w, $h), (C '#c02a66'), (C '#6e1035'), 45
}

function NewCanvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

# Rounded-square icon (transparent corners), optional full-bleed for maskable/apple.
function Icon([int]$size, [string]$file, [bool]$fullBleed, [float]$glyphScale) {
  $bmp, $g = NewCanvas $size $size
  $s = $size / 64.0
  $g.ScaleTransform($s, $s)
  if ($fullBleed) {
    $g.FillRectangle((BgBrush 0 0 64 64), 0, 0, 64, 64)
  } else {
    $g.FillPath((BgBrush 0 0 64 64), (RoundRect 0 0 64 64 14))
  }
  $g.TranslateTransform(32, 33)
  $g.ScaleTransform($glyphScale, $glyphScale)
  $g.TranslateTransform(-32.5, -33.5)
  DrawGlyph $g
  $bmp.Save((Join-Path $pub $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Icon 192 'icon-192.png' $false 1.0
Icon 512 'icon-512.png' $false 1.0
Icon 512 'icon-maskable-512.png' $true 0.72
Icon 180 'apple-touch-icon.png' $true 0.85

# Open Graph images (1200x630)
$pages = @(
  @('home', 'Private file tools', 'that never upload your files'),
  @('merge-pdf', 'Merge PDF files', 'Combine PDFs in your browser'),
  @('split-pdf', 'Split PDF', 'Extract pages or split every page'),
  @('organize-pdf', 'Reorder PDF pages', 'Drag, rotate and delete pages'),
  @('redact-pdf', 'Redact PDF for real', 'The hidden text is actually gone'),
  @('compress-image', 'Compress images', 'JPG, PNG and WebP, in batches'),
  @('resize-image', 'Resize and convert images', 'JPG, PNG, WebP and AVIF'),
  @('heic-to-jpg', 'HEIC to JPG converter', 'Convert iPhone photos in batches'),
  @('remove-photo-metadata', 'Remove photo metadata', 'Strip EXIF and GPS location'),
  @('how-do-i-know', 'How do I know?', 'Verify that nothing is uploaded')
)
foreach ($p in $pages) {
  $bmp, $g = NewCanvas 1200 630
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, 1200, 630), (C '#1a1218'), (C '#3d1a2a'), 30
  $g.FillRectangle($bg, 0, 0, 1200, 630)
  # mark
  $state = $g.Save()
  $g.TranslateTransform(80, 90)
  $g.ScaleTransform(2.2, 2.2)
  $g.FillPath((BgBrush 0 0 64 64), (RoundRect 0 0 64 64 14))
  DrawGlyph $g
  $g.Restore($state)
  $white = New-Object System.Drawing.SolidBrush (C '#ffffff')
  $pink = New-Object System.Drawing.SolidBrush (C '#f9a8c6')
  $soft = New-Object System.Drawing.SolidBrush (C '#d9c9d1')
  $brandFont = New-Object System.Drawing.Font 'Segoe UI', 44, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('File', $brandFont, $white, 240, 118)
  $fileW = $g.MeasureString('File', $brandFont).Width
  $g.DrawString('ward', $brandFont, $pink, 240 + $fileW - 14, 118)
  $titleFont = New-Object System.Drawing.Font 'Segoe UI', 76, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font 'Segoe UI', 40, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $smallFont = New-Object System.Drawing.Font 'Segoe UI', 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($p[1], $titleFont, $white, (New-Object System.Drawing.RectangleF 76, 280, 1060, 110))
  $g.DrawString($p[2], $subFont, $soft, 80, 392)
  # pill
  $pill = RoundRect 80 490 760 64 32
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#9f1d4f')), $pill)
  $dot = [string][char]0x00B7
  $g.DrawString("Free  $dot  No upload  $dot  Works offline", $smallFont, $white, 108, 503)
  $bmp.Save((Join-Path $og "$($p[0]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output 'Images written.'
