# Genera el favicon del Banco a partir de public/logo1.jpeg (los dos
# pescaditos). Recorta la ilustracion, la centra en un cuadrado y escribe un
# .ico multi-resolucion (16, 32 y 48 px) en src/app/favicon.ico.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/generate-favicon.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "public\logo1.jpeg"
$outDir = Join-Path $root "src\app"
$icoPath = Join-Path $outDir "favicon.ico"
$pngPath = Join-Path $outDir "icon.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Origen: $($src.Width) x $($src.Height)"

# --- 1. Recorta la mitad superior: solo la ilustracion (los pescaditos) ---
$cropTop = 0
$cropBottom = [int]($src.Height * 0.70)   # el texto del logo empieza aqui
$cropW = $src.Width
$cropH = $cropBottom - $cropTop

$bmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)),
             (New-Object System.Drawing.Rectangle(0, $cropTop, $cropW, $cropH)),
             [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

# --- 2. Encuentra el contenido real (los pescaditos) dentro del recorte ---
$minX = $cropW; $minY = $cropH; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $cropH; $y += 2) {
  for ($x = 0; $x -lt $cropW; $x += 2) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.R -lt 245 -or $p.G -lt 245 -or $p.B -lt 245) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Host "Contenido: x[$minX..$maxX] y[$minY..$maxY]"

# --- 3. Cuadrado centrado en el contenido, con un pequeno margen ---
$pad = 12
$contentW = $maxX - $minX + 1
$contentH = $maxY - $minY + 1
$side = [Math]::Max($contentW, $contentH) + (2 * $pad)
$side = [int]([Math]::Ceiling($side / 2.0) * 2)

$square = New-Object System.Drawing.Bitmap($side, $side)
$gs = [System.Drawing.Graphics]::FromImage($square)
$gs.Clear([System.Drawing.Color]::White)
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gs.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$destX = [int](($side - $contentW) / 2)
$destY = [int](($side - $contentH) / 2)
$gs.DrawImage($bmp,
  (New-Object System.Drawing.Rectangle($destX, $destY, $contentW, $contentH)),
  (New-Object System.Drawing.Rectangle($minX, $minY, $contentW, $contentH)),
  [System.Drawing.GraphicsUnit]::Pixel)
$gs.Dispose()

# --- 4. PNG de 512 px (iconos modernos / pantallas retina) ---
$big = New-Object System.Drawing.Bitmap(512, 512)
$gb = [System.Drawing.Graphics]::FromImage($big)
$gb.Clear([System.Drawing.Color]::White)
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gb.DrawImage($square, 0, 0, 512, 512)
$gb.Dispose()
$big.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "PNG: $pngPath"

# --- 5. ICO multi-resolucion (16, 32, 48) ---
$sizes = @(16, 32, 48)
$frames = @()
foreach ($s in $sizes) {
  $ico = New-Object System.Drawing.Bitmap($s, $s)
  $gi = [System.Drawing.Graphics]::FromImage($ico)
  $gi.Clear([System.Drawing.Color]::White)
  $gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gi.DrawImage($square, 0, 0, $s, $s)
  $gi.Dispose()
  $frames += $ico
}

# Escritura manual del ICO: una cabecera + un directorio + los PNG de cada tamano.
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
$payloads = @()
foreach ($ico in $frames) {
  $pngMs = New-Object System.IO.MemoryStream
  $ico.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $pngMs.ToArray()
  $payloads += ,$bytes
}
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $bytes = $payloads[$i]
  $bw.Write([Byte]$sizes[$i]); $bw.Write([Byte]$sizes[$i])
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$bytes.Length); $bw.Write([UInt32]$offset)
  $offset += $bytes.Length
}
foreach ($bytes in $payloads) { $bw.Write($bytes) }
$bw.Flush()

[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$ms.Dispose()

Write-Host "ICO: $icoPath ($((Get-Item $icoPath).Length) bytes, tamanos $($sizes -join ', '))"

$src.Dispose(); $bmp.Dispose(); $square.Dispose(); $big.Dispose()
