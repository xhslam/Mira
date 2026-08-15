param(
  [string]$AssetDirectory = (Join-Path $PSScriptRoot "..\assets")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-Canvas([int]$Size, [System.Drawing.Color]$Background) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($Background)
  return @($bitmap, $graphics)
}

function Add-RoundedRectangle(
  [System.Drawing.Graphics]$Graphics,
  [System.Drawing.Brush]$Brush,
  [float]$X,
  [float]$Y,
  [float]$Width,
  [float]$Height,
  [float]$Radius
) {
  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Add-InkstoneMark(
  [System.Drawing.Graphics]$Graphics,
  [float]$Scale,
  [bool]$Monochrome = $false
) {
  $green = if ($Monochrome) { [System.Drawing.Color]::White } else { [System.Drawing.ColorTranslator]::FromHtml("#24705B") }
  $paper = if ($Monochrome) { [System.Drawing.Color]::Transparent } else { [System.Drawing.ColorTranslator]::FromHtml("#FFFFFF") }
  $greenBrush = [System.Drawing.SolidBrush]::new($green)
  Add-RoundedRectangle $Graphics $greenBrush (172 * $Scale) (172 * $Scale) (680 * $Scale) (680 * $Scale) (150 * $Scale)

  if (-not $Monochrome) {
    $paperBrush = [System.Drawing.SolidBrush]::new($paper)
    Add-RoundedRectangle $Graphics $paperBrush (300 * $Scale) (258 * $Scale) (424 * $Scale) (508 * $Scale) (48 * $Scale)
    $paperBrush.Dispose()

    $lineBrush = [System.Drawing.SolidBrush]::new($green)
    Add-RoundedRectangle $Graphics $lineBrush (370 * $Scale) (390 * $Scale) (284 * $Scale) (38 * $Scale) (19 * $Scale)
    Add-RoundedRectangle $Graphics $lineBrush (370 * $Scale) (486 * $Scale) (220 * $Scale) (38 * $Scale) (19 * $Scale)
    Add-RoundedRectangle $Graphics $lineBrush (370 * $Scale) (582 * $Scale) (260 * $Scale) (38 * $Scale) (19 * $Scale)
    $lineBrush.Dispose()
  }
  $greenBrush.Dispose()
}

function Save-Icon([string]$Path, [int]$Size, [System.Drawing.Color]$Background, [bool]$Monochrome = $false) {
  $canvas = New-Canvas $Size $Background
  $bitmap = $canvas[0]
  $graphics = $canvas[1]
  Add-InkstoneMark $graphics ($Size / 1024) $Monochrome
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$offWhite = [System.Drawing.ColorTranslator]::FromHtml("#F4F7F5")
$transparent = [System.Drawing.Color]::Transparent
New-Item -ItemType Directory -Path $AssetDirectory -Force | Out-Null
Save-Icon (Join-Path $AssetDirectory "icon.png") 1024 $offWhite
Save-Icon (Join-Path $AssetDirectory "android-icon-foreground.png") 1024 $transparent
Save-Icon (Join-Path $AssetDirectory "android-icon-monochrome.png") 1024 $transparent $true
Save-Icon (Join-Path $AssetDirectory "splash-icon.png") 1024 $transparent
Save-Icon (Join-Path $AssetDirectory "favicon.png") 64 $offWhite

$backgroundCanvas = New-Canvas 1024 $offWhite
$backgroundCanvas[0].Save(
  (Join-Path $AssetDirectory "android-icon-background.png"),
  [System.Drawing.Imaging.ImageFormat]::Png
)
$backgroundCanvas[1].Dispose()
$backgroundCanvas[0].Dispose()
