param(
  [Parameter(Mandatory)][string]$Path,
  [string]$AppId = $env:FEISHU_APP_ID,
  [string]$AppSecret = $env:FEISHU_APP_SECRET
)
$ErrorActionPreference = 'Stop'
$body = @{ app_id = $AppId; app_secret = $AppSecret } | ConvertTo-Json
$tk = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body
$H = @{ Authorization = "Bearer $($tk.tenant_access_token)" }
$folder = (Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/files/create_folder' -Method Post -Headers $H `
  -ContentType 'application/json; charset=utf-8' -Body (@{ name = 'diag'; folder_token = '' } | ConvertTo-Json)).data.token

function Test-Md([string]$text) {
  for ($attempt = 0; $attempt -lt 2; $attempt++) {
    $tmp = Join-Path $env:TEMP ("diag_" + [guid]::NewGuid().ToString('N') + '.md')
    [IO.File]::WriteAllText($tmp, $text, (New-Object Text.UTF8Encoding($false)))
    $size = (Get-Item $tmp).Length
    $up = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/files/upload_all' -Method Post -Headers $H -Form @{
      file_name = 'doc.md'; parent_type = 'explorer'; parent_node = $folder; size = "$size"; file = (Get-Item $tmp) }
    $b = @{ file_extension = 'md'; file_token = $up.data.file_token; type = 'docx'; file_name = 'diag'
            point = @{ mount_type = 1; mount_key = $folder } } | ConvertTo-Json -Depth 5
    $t = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/import_tasks' -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' -Body $b
    for ($i = 0; $i -lt 25; $i++) {
      Start-Sleep -Milliseconds 1000
      $j = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/drive/v1/import_tasks/$($t.data.ticket)" -Headers $H
      $s = $j.data.result.job_status
      if ($s -eq 0) { Remove-Item $tmp -ErrorAction SilentlyContinue; return $true }
      if ($s -eq 2 -or $s -eq 3) { break }
    }
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
  return $false
}

$lines = Get-Content $Path
Write-Host "lines=$($lines.Count)"
if (Test-Md ($lines -join "`n")) { Write-Host 'FULL OK（完整文件其实能导入，之前是偶发）'; exit 0 }

$lo = 1; $hi = $lines.Count
while ($lo -lt $hi) {
  $mid = [int][math]::Floor(($lo + $hi) / 2)
  $sub = ($lines[0..($mid - 1)] -join "`n")
  $ok = Test-Md $sub
  Write-Host "prefix=$mid -> $ok"
  if ($ok) { $lo = $mid + 1 } else { $hi = $mid }
}
Write-Host "`n首个导致失败的累计行数 = $lo"
Write-Host "可疑行: $($lines[$lo - 1])"
