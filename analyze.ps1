Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('C:\Users\121212\AppData\Local\Temp\cuse-screenshots\screen-1779359856828.jpg')
$w = $bmp.Width
$h = $bmp.Height
Write-Host "Image size: $w x $h"
$stepX = [int]($w / 10)
$stepY = [int]($h / 8)
for ($y = 0; $y -lt 8; $y++) {
    for ($x = 0; $x -lt 10; $x++) {
        $px = $x * $stepX
        $py = $y * $stepY
        $c = $bmp.GetPixel($px, $py)
        $bri = [Math]::Round(($c.R + $c.G + $c.B) / 3)
        Write-Host "($px,$py): R=$($c.R) G=$($c.G) B=$($c.B) bri=$bri"
    }
}
$bmp.Dispose()