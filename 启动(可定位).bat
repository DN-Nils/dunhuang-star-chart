@echo off
chcp 65001 >nul
setlocal
title Dunhuang Star Chart - Local Preview (geolocation enabled)
cd /d "%~dp0"

echo.
echo   Starting local server ... your browser will open automatically.
echo   Opening through this server is what allows the page to use real geolocation.
echo.
echo   Close the server: close this window or press Ctrl+C
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-Content -LiteralPath '%~f0'; $i = [Array]::IndexOf($c, '::PS-BEGIN'); if ($i -lt 0) { exit 9 }; $c[($i+1)..($c.Length-1)] | Set-Content -LiteralPath ($env:TEMP + '\dunhuang_serve.ps1') -Encoding UTF8"
if errorlevel 1 goto :FAILED
if not exist "%TEMP%\dunhuang_serve.ps1" goto :FAILED

powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\dunhuang_serve.ps1" -Port 8765 -Root "%~dp0"
exit /b 0

:FAILED
echo.
echo   Failed to prepare the server script. Make sure this file is intact.
pause
exit /b 1

::PS-BEGIN
param([int]$Port = 8765, [string]$Root = '')

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')

# Serve the first .html in the folder (file name may be non-ASCII, so detect it)
$pageFile = Get-ChildItem -LiteralPath $Root -Filter *.html -File |
            Sort-Object Length -Descending | Select-Object -First 1
if (-not $pageFile) {
  Write-Host "  No .html file found next to this launcher." -ForegroundColor Red
  exit 1
}
$Page = $pageFile.Name

$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
  '.py'   = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.png' = 'image/png'
  '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
}

function Try-Listen([int]$p) {
  $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
  try { $l.Start(); return $l } catch { try { $l.Stop() } catch {}; return $null }
}

$listener = $null
foreach ($p in @($Port, ($Port + 1), ($Port + 2), ($Port + 3), ($Port + 4))) {
  $listener = Try-Listen $p
  if ($listener) { $Port = $p; break }
}
if (-not $listener) {
  Write-Host "  Ports 8765-8769 are all in use." -ForegroundColor Red
  exit 1
}

$base = "http://127.0.0.1:$Port/"
Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
Write-Host "  URL : $base" -ForegroundColor Cyan
Write-Host "  Page: $Page" -ForegroundColor Gray
Write-Host "  Stop: Ctrl+C" -ForegroundColor Gray
Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

Start-Process ($base + [System.Uri]::EscapeDataString($Page))

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000

    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $line = $reader.ReadLine()
    if (-not $line) { $client.Close(); continue }
    while ($true) { $h = $reader.ReadLine(); if ($null -eq $h -or $h -eq '') { break } }

    $target = ($line -split ' ')[1]
    if (-not $target) { $target = '/' }
    $qi = $target.IndexOf('?')
    if ($qi -ge 0) { $target = $target.Substring(0, $qi) }
    $rel = [System.Uri]::UnescapeDataString($target).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = $Page }

    $status = '200 OK'
    $ctype = 'application/octet-stream'
    $body = $null

    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
      $status = '403 Forbidden'; $ctype = 'text/plain; charset=utf-8'
      $body = [System.Text.Encoding]::UTF8.GetBytes('403')
    } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      $body = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      if ($Mime.ContainsKey($ext)) { $ctype = $Mime[$ext] }
    } else {
      $status = '404 Not Found'; $ctype = 'text/plain; charset=utf-8'
      $body = [System.Text.Encoding]::UTF8.GetBytes('404')
    }

    $head = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`n" +
            "Cache-Control: no-store`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch {
  } finally {
    if ($client) { try { $client.Close() } catch {} }
  }
}