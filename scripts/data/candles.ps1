# Digitises the candles on the Trade board: scans image columns in the chart
# area, finds green and red pixels, groups them into candles, and prints each
# candle's centre x, wick top/bottom and body top/bottom in board CSS px, plus
# the volume bar height under it. Its output is candles-raw.txt, which
# make-candles.mjs turns into the candle data. -In was a crop of the board's
# chart; the crop isn't kept. A record of how the data was made.
param(
  [Parameter(Mandatory)] [string]$In,
  [double]$X0 = 15, [double]$X1 = 705, [double]$Y0 = 150, [double]$Y1 = 500,
  [double]$VY0 = 470, [double]$VY1 = 548,
  [double]$Factor = 3
)
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $In
function Kind($c) {
  if ($c.G -gt 70 -and $c.R -lt 70 -and $c.B -lt 80 -and ($c.G - $c.R) -gt 30) { return 'g' }
  if ($c.R -gt 140 -and $c.G -lt 90 -and $c.B -lt 90) { return 'r' }
  return ''
}
$cols = @()
for ($px = [int]($X0 * $Factor); $px -le [int]($X1 * $Factor); $px++) {
  $top = -1; $bot = -1; $kind = ''; $count = 0
  for ($py = [int]($Y0 * $Factor); $py -le [int]($Y1 * $Factor); $py++) {
    $k = Kind ($bmp.GetPixel($px, $py))
    if ($k) { if ($top -lt 0) { $top = $py }; $bot = $py; $kind = $k; $count++ }
  }
  $cols += ,@($px, $top, $bot, $kind, $count)
}
# group runs of coloured columns
$candles = @(); $run = @()
foreach ($c in $cols) {
  if ($c[1] -ge 0) { $run += ,$c } elseif ($run.Count) { $candles += ,$run; $run = @() }
}
if ($run.Count) { $candles += ,$run }
foreach ($run in $candles) {
  $xs = $run | ForEach-Object { $_[0] }
  $center = ($xs | Measure-Object -Average).Average / $Factor
  $wickTop = ($run | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum / $Factor
  $wickBot = ($run | ForEach-Object { $_[2] } | Measure-Object -Maximum).Maximum / $Factor
  # body: columns whose coloured extent is at least the median width -> use the 2nd and 2nd-last columns
  $inner = if ($run.Count -ge 5) { $run[1..($run.Count - 2)] } else { $run }
  $bodyCols = $inner | Where-Object { $_[0] -ne $run[[int]($run.Count / 2)][0] }
  if (-not $bodyCols) { $bodyCols = $inner }
  $bodyTop = ($bodyCols | ForEach-Object { $_[1] } | Measure-Object -Maximum).Maximum / $Factor
  $bodyBot = ($bodyCols | ForEach-Object { $_[2] } | Measure-Object -Minimum).Minimum / $Factor
  $kinds = ($run | Where-Object { $_[3] } | ForEach-Object { $_[3] } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1).Name
  # volume bar: grey pixels below
  $vx = [int]($center * $Factor)
  $vtop = -1
  for ($py = [int]($VY0 * $Factor); $py -le [int]($VY1 * $Factor); $py++) {
    $c = $bmp.GetPixel($vx, $py)
    if ($c.R -lt 215 -and $c.R -gt 170 -and [Math]::Abs($c.R - $c.G) -lt 14 -and ($c.R - $c.B) -gt 5) { $vtop = $py; break }
  }
  $vol = if ($vtop -ge 0) { ($VY1 * $Factor - $vtop) / $Factor } else { 0 }
  '{0:N1} {1:N1} {2:N1} {3:N1} {4:N1} {5} {6} {7:N1}' -f $center, $wickTop, $wickBot, $bodyTop, $bodyBot, $kinds, $run.Count, $vol
}
$bmp.Dispose()
