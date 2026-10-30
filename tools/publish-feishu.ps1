# 把本地 docs/*.md 发布到飞书知识库（幂等：已存在同名节点则跳过）
# 用法：
#   $env:FEISHU_APP_ID='cli_xxx'; $env:FEISHU_APP_SECRET='xxx'
#   pwsh tools/publish-feishu.ps1
# 注意：已在知识库中的文档不会被覆盖——飞书版是编辑主副本。

param(
  [string]$AppId = $env:FEISHU_APP_ID,
  [string]$AppSecret = $env:FEISHU_APP_SECRET,
  [string]$SpaceId = '7527979690225860636',
  [string]$ParentNode = 'Po2EwDeDein03VkPCwjcQVkxnSe',
  [string]$Root = (Split-Path $PSScriptRoot -Parent),
  [switch]$SkipIndex
)

$ErrorActionPreference = 'Stop'
if (-not $AppId -or -not $AppSecret) { throw '缺少 FEISHU_APP_ID / FEISHU_APP_SECRET' }

# ---------- 鉴权 ----------
$body = @{ app_id = $AppId; app_secret = $AppSecret } | ConvertTo-Json
$tk = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' `
  -Method Post -ContentType 'application/json; charset=utf-8' -Body $body
if ($tk.code -ne 0) { throw "取 token 失败: $($tk.msg)" }
$H = @{ Authorization = "Bearer $($tk.tenant_access_token)" }

# ---------- 临时文件夹 ----------
$folder = (Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/files/create_folder' `
  -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' `
  -Body (@{ name = "idollife-sync-$(Get-Date -Format yyyyMMdd-HHmmss)"; folder_token = '' } | ConvertTo-Json)).data.token

# ---------- 工具函数 ----------
function Convert-Md([string]$md) {
  $lines = $md -split "`r?`n"
  if ($lines.Count -gt 1 -and $lines[0] -match '^#\s+') { $lines = $lines[1..($lines.Count - 1)] }
  $text = $lines -join "`n"
  # 站内 .md 链接在飞书里无意义，降级为纯文本（保留外链）
  $text = [regex]::Replace($text, '\[([^\]]+)\]\((?!https?://)[^)\s]*\.md(?:#[^)]*)?\)', '$1')
  return $text
}

function Upload-File([string]$path, [string]$name) {
  $size = (Get-Item $path).Length
  $r = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/files/upload_all' -Method Post -Headers $H -Form @{
    file_name = $name; parent_type = 'explorer'; parent_node = $folder; size = "$size"; file = (Get-Item $path)
  }
  if ($r.code -ne 0) { throw "上传失败: $($r.msg)" }
  return $r.data.file_token
}

function Import-Doc([string]$fileToken, [string]$title) {
  $b = @{ file_extension = 'md'; file_token = $fileToken; type = 'docx'; file_name = $title
          point = @{ mount_type = 1; mount_key = $folder } } | ConvertTo-Json -Depth 5
  $t = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/drive/v1/import_tasks' -Method Post `
    -Headers $H -ContentType 'application/json; charset=utf-8' -Body $b
  if ($t.code -ne 0) { throw "建导入任务失败: $($t.msg)" }
  $ticket = $t.data.ticket
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 1200
    $j = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/drive/v1/import_tasks/$ticket" -Headers $H
    $s = $j.data.result.job_status
    if ($s -eq 0) { return $j.data.result.token }
    if ($s -eq 2 -or $s -eq 3) { throw "导入失败: $($j.data.result.job_error_msg)" }
  }
  throw '导入超时'
}

function Move-ToWiki([string]$docToken) {
  $b = @{ parent_wiki_token = $ParentNode; obj_type = 'docx'; obj_token = $docToken } | ConvertTo-Json
  $m = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/wiki/v2/spaces/$SpaceId/nodes/move_docs_to_wiki" `
    -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' -Body $b
  if ($m.code -ne 0) { throw "移动到知识库失败: $($m.msg) / $($m | ConvertTo-Json -Compress)" }
  return $m
}

function Wait-Node([string]$title) {
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 800
    $c = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/wiki/v2/spaces/$SpaceId/nodes?page_size=50&parent_node_token=$ParentNode" -Headers $H
    $hit = $c.data.items | Where-Object { $_.title -eq $title }
    if ($hit) { return $hit }
  }
  return $null
}

# ---------- 目录 ----------
$index = @{
  title  = '00 · idollife 项目总览'
  source = Join-Path $Root 'README.md'
  preamble = @'
## 怎么用这套文档（飞书版）

1. 每篇里带 **【待填】** 的地方，就是需要你补的。用飞书右上角搜索 `【待填】` 能定位到全部。
2. 「待确认」是勾选框，定下来直接勾上，比打字快。
3. **只写要点就行，不用管措辞。** 你写「番茄钟就算加速器吧」，我负责改写成正式段落，并同步改掉受影响的关联章节。
4. 改了哪篇，跟我说一声。我会把《16 决策记录》和《17 待确认问题》一起更新，避免前后矛盾。
5. 建议顺序：**01 → 02 → 12**（定位、核心循环、番茄钟）。这三篇定下来就能开工，其余边做边补。
6. 想看谁改了什么：本文右上角「···」→ 版本历史。

---

'@
}

$docs = @()
if (-not $SkipIndex) { $docs += $index }
$ordered = Get-ChildItem -Path (Join-Path $Root 'docs') -Filter '*.md' |
  Where-Object { $_.Name -ne '_模板.md' } | Sort-Object Name
foreach ($f in $ordered) {
  $t = ($f.BaseName -replace '^(\d+)-', '$1 · ')
  $docs += @{ title = $t; source = $f.FullName; preamble = '' }
}
# 已有节点标题，用于幂等跳过
$existing = @{}
$page = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/wiki/v2/spaces/$SpaceId/nodes?page_size=50&parent_node_token=$ParentNode" -Headers $H
foreach ($n in $page.data.items) { $existing[$n.title] = $n.node_token }

# ---------- 主流程 ----------
$ok = 0; $fail = 0; $skip = 0
foreach ($d in $docs) {
  if (-not (Test-Path $d.source)) { Write-Host "MISS  $($d.title)"; $fail++; continue }
  if ($existing.ContainsKey($d.title)) {
    Write-Host "SKIP  $($d.title)（已存在）"; $skip++; continue
  }
  try {
    $md = Convert-Md (Get-Content $d.source -Raw)
    if ($d.preamble) { $md = $d.preamble + $md }
    $tmp = Join-Path $env:TEMP ("pub_" + [guid]::NewGuid().ToString('N') + '.md')
    [IO.File]::WriteAllText($tmp, $md, (New-Object Text.UTF8Encoding($false)))

    $ft = $null
    $dt = $null
    for ($try = 1; $try -le 3 -and -not $dt; $try++) {
      try {
        $ft = Upload-File $tmp 'doc.md'
        $dt = Import-Doc $ft $d.title
      } catch {
        if ($try -eq 3) { throw }
        Write-Host "      重试 $try/3（$($_.Exception.Message)）"
        Start-Sleep -Seconds 3
      }
    }
    Move-ToWiki $dt | Out-Null
    $node = Wait-Node $d.title
    if ($node) { Write-Host "OK    $($d.title)  -> $($node.node_token)"; $ok++ }
    else { Write-Host "WARN  $($d.title) 已导入但未在知识库列出"; $fail++ }

    # 清理临时上传文件
    try { Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/drive/v1/files/$ft?type=file" -Method Delete -Headers $H | Out-Null } catch {}
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
  } catch {
    Write-Host "FAIL  $($d.title): $($_.Exception.Message)"
    $fail++
  }
}
Write-Host "`n完成：成功 $ok，跳过 $skip，失败 $fail"

# ---------- 清空临时文件夹 ----------
try {
  $ls = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/drive/v1/files?folder_token=$folder&page_size=50" -Headers $H
  foreach ($it in $ls.data.files) {
    try { Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/drive/v1/files/$($it.token)?type=$($it.type)" -Method Delete -Headers $H | Out-Null } catch {}
  }
} catch {}

