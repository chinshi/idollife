param(
  [string]$AppId = $env:FEISHU_APP_ID,
  [string]$AppSecret = $env:FEISHU_APP_SECRET
)
$ErrorActionPreference = 'Stop'
$body = @{ app_id = $AppId; app_secret = $AppSecret } | ConvertTo-Json
$tk = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body
$H = @{ Authorization = "Bearer $($tk.tenant_access_token)" }

$docs = [ordered]@{
  '01' = 'KOHAw7S2dihxrekkNu7cDonGnye'
  '02' = 'G7gIwqgQTigyNYkXsc1cwb6QnCg'
  '03' = 'Ok4cwcUGbiFupJkSDzQch28zn6d'
  '04' = 'UKFkwywzyiiMGJkdmeAciMXVnNg'
  '05' = 'A3g4wDdIiiLArVkaxc0cKQJynYc'
  '06' = 'P8CvwVtNGikX7DkKJ6DcUWWCnWo'
  '07' = 'EYi2w50KUiRoKwkiekccEcuunFh'
  '08' = 'OEwywAtABiDAp9kqDz3cdwe9nEc'
  '09' = 'UIEDwyqLDi32nfkiyY6cHe5Fn6f'
  '10' = 'VyuSwIgDmiVnhokmGWScllrEnC8'
  '11' = 'E5KTwzfm5izctCkJ8kRcEdE5nyc'
  '12' = 'DpaiwCFBSii8ujkIzf7chqUQnMk'
  '13' = 'VWFjwUTHOicHmbkqkU7cKBiCneb'
  '14' = 'CYhGwGkTbilJ9RkzVEXc8X1xncH'
}

function Get-BlockText($b) {
  foreach ($p in 'text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
    'heading7', 'heading8', 'heading9', 'bullet', 'ordered', 'code', 'quote', 'todo', 'callout') {
    if ($b.PSObject.Properties.Name -contains $p) {
      $el = $b.$p.elements
      if ($el) { return (($el | ForEach-Object { $_.text_run.content }) -join '') }
    }
  }
  return ''
}

$total = 0
foreach ($k in $docs.Keys) {
  $doc = $docs[$k]
  $cur = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/docx/v1/documents/$doc/blocks/$doc/children?page_size=500" -Headers $H
  $items = $cur.data.items

  # 定位决策区：待确认 / 定稿清单 标题起，到下一个标题止
  $inRegion = $false
  $targets = @()
  for ($i = 0; $i -lt $items.Count; $i++) {
    $b = $items[$i]
    $isHeading = $b.block_type -ge 3 -and $b.block_type -le 11
    $txt = Get-BlockText $b
    if ($isHeading) { $inRegion = ($txt -match '待确认|定稿') }
    elseif ($inRegion -and $b.block_type -eq 17) {
      $targets += [pscustomobject]@{ index = $i; id = $b.block_id; text = $txt }
    }
  }

  if ($targets.Count -eq 0) { Write-Host "$k 待确认区无勾选框"; continue }

  # 从后往前：先插新块（index），再删旧块（index+1）
  foreach ($t in ($targets | Sort-Object index -Descending)) {
    $payload = @{
      children = @(@{
        block_type = 12
        bullet = @{ elements = @(@{ text_run = @{ content = "【待填】$($t.text)"; text_element_style = @{} } }); style = @{} }
      })
      index = $t.index
    } | ConvertTo-Json -Depth 10
    $ins = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/docx/v1/documents/$doc/blocks/$doc/children" `
      -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' -Body $payload
    if ($ins.code -ne 0) { Write-Host "  插入失败 $($t.text): $($ins.msg)"; continue }

    $del = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/docx/v1/documents/$doc/blocks/$doc/children/batch_delete" `
      -Method Delete -Headers $H -ContentType 'application/json; charset=utf-8' `
      -Body (@{ start_index = $t.index + 1; end_index = $t.index + 2 } | ConvertTo-Json)
    if ($del.code -ne 0) { Write-Host "  删除失败 $($t.text): $($del.msg)" }

    $total++
    Start-Sleep -Milliseconds 120
  }
  Write-Host "$k 完成 $($targets.Count) 条"
}
Write-Host "`n合计转换 $total 条"
