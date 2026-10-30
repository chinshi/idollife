param(
  [string]$AppId = $env:FEISHU_APP_ID,
  [string]$AppSecret = $env:FEISHU_APP_SECRET,
  [string]$DocId = 'TxzpwJWlHiTQ8CkQcFCcnUFmnId'   # 00 · idollife 项目总览
)
$ErrorActionPreference = 'Stop'
$body = @{ app_id = $AppId; app_secret = $AppSecret } | ConvertTo-Json
$tk = Invoke-RestMethod -Uri 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body
$H = @{ Authorization = "Bearer $($tk.tenant_access_token)" }

$nodes = @(
  @{ t = '00 · idollife 项目总览';       u = 'https://my.feishu.cn/wiki/TxzpwJWlHiTQ8CkQcFCcnUFmnId' },
  @{ t = '01 · 产品定位与目标用户';       u = 'https://my.feishu.cn/wiki/KOHAw7S2dihxrekkNu7cDonGnye' },
  @{ t = '02 · 核心玩法与循环';           u = 'https://my.feishu.cn/wiki/G7gIwqgQTigyNYkXsc1cwb6QnCg' },
  @{ t = '03 · 系统清单与优先级';         u = 'https://my.feishu.cn/wiki/Ok4cwcUGbiFupJkSDzQch28zn6d' },
  @{ t = '04 · 数值与经济';               u = 'https://my.feishu.cn/wiki/UKFkwywzyiiMGJkdmeAciMXVnNg' },
  @{ t = '05 · 内容与叙事';               u = 'https://my.feishu.cn/wiki/A3g4wDdIiiLArVkaxc0cKQJynYc' },
  @{ t = '06 · 界面与交互';               u = 'https://my.feishu.cn/wiki/P8CvwVtNGikX7DkKJ6DcUWWCnWo' },
  @{ t = '07 · 文本与文案规范';           u = 'https://my.feishu.cn/wiki/EYi2w50KUiRoKwkiekccEcuunFh' },
  @{ t = '08 · 摸鱼场景与节奏';           u = 'https://my.feishu.cn/wiki/OEwywAtABiDAp9kqDz3cdwe9nEc' },
  @{ t = '09 · 技术选型';                 u = 'https://my.feishu.cn/wiki/UIEDwyqLDi32nfkiyY6cHe5Fn6f' },
  @{ t = '10 · 架构与模块';               u = 'https://my.feishu.cn/wiki/VyuSwIgDmiVnhokmGWScllrEnC8' },
  @{ t = '11 · 数据模型与存档';           u = 'https://my.feishu.cn/wiki/E5KTwzfm5izctCkJ8kRcEdE5nyc' },
  @{ t = '12 · 番茄钟与时间系统';         u = 'https://my.feishu.cn/wiki/DpaiwCFBSii8ujkIzf7chqUQnMk' },
  @{ t = '13 · 里程碑与迭代';             u = 'https://my.feishu.cn/wiki/VWFjwUTHOicHmbkqkU7cKBiCneb' },
  @{ t = '14 · 测试与验收';               u = 'https://my.feishu.cn/wiki/CYhGwGkTbilJ9RkzVEXc8X1xncH' },
  @{ t = '15 · 术语表';                   u = 'https://my.feishu.cn/wiki/FQABw082JiOFlskoWdNcOrSsnFh' },
  @{ t = '16 · 决策记录';                 u = 'https://my.feishu.cn/wiki/Off3wYRXdizMVxkXhN7cCKkXn0e' },
  @{ t = '17 · 待确认问题';               u = 'https://my.feishu.cn/wiki/U1cwwntx7iYNFWklzBHcwUgKnbP' },
  @{ t = '（原始需求）IF核心和主题';      u = 'https://my.feishu.cn/wiki/OQGnwtbzniJH3PkDA3qcGR1wngf' }
)

function New-LinkBlock([string]$text, [string]$url) {
  @{
    block_type = 2
    text = @{
      elements = @(@{ text_run = @{ content = $text; text_element_style = @{ link = @{ url = $url } } } })
      style = @{}
    }
  }
}

$children = @()
$children += @{
  block_type = 4
  heading2 = @{ elements = @(@{ text_run = @{ content = '文档索引（点击跳转）'; text_element_style = @{} } }); style = @{} }
}
foreach ($n in $nodes) { $children += (New-LinkBlock $n.t $n.u) }

# 追加到页面末尾
$cur = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/docx/v1/documents/$DocId/blocks/$DocId/children?page_size=500" -Headers $H
$idx = $cur.data.items.Count
Write-Output "现有顶层块: $idx"

$payload = @{ children = $children; index = $idx } | ConvertTo-Json -Depth 12
$r = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/docx/v1/documents/$DocId/blocks/$DocId/children" `
  -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' -Body $payload
Write-Output "追加结果: code=$($r.code) msg=$($r.msg)"
if ($r.code -ne 0) { $r | ConvertTo-Json -Depth 6 }
