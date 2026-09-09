$ErrorActionPreference='Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$repoName=if($env:NW_REPO_NAME){$env:NW_REPO_NAME}else{'newsweave-news-hub'}
$result=Join-Path (Get-Location) 'github-diagnose-result.txt'
Set-Content $result "NewsWeave diagnostics v1.0.3`r`nStarted: $(Get-Date -Format o)" -Encoding UTF8
function Say($k,$m){Write-Host "[$k] $m";Add-Content $result "[$k] $m" -Encoding UTF8}
if(-not(Test-Path '.newsweave-project')){Say 'ERROR' '.newsweave-project is missing. Use the extracted NewsWeave folder.';exit 1}
Say 'OK' "Project folder: $(Get-Location)"
if(-not(Get-Command gh -ErrorAction SilentlyContinue)){Say 'ERROR' 'GitHub CLI is missing.';Say 'RECOVERY' 'winget install --id GitHub.cli -e';exit 1}
& gh auth status --active -h github.com
$login=(& gh api user --jq '.login' 2>$null | Out-String).Trim()
if(-not $login){Say 'ERROR' 'No active GitHub CLI account.';Say 'RECOVERY' 'gh auth login -h github.com -p https -s repo,workflow -w';exit 1}
$full="$login/$repoName";Say 'OK' "Active account: $login";Say 'OK' "Expected repo: $full"
if(Test-Path '.git'){Say 'CHECK' 'Local Git state';git status -sb;git remote -v}else{Say 'WARN' 'No local .git repository yet.'}
$url=(& gh api "repos/$full" --jq '.html_url' 2>$null | Out-String).Trim()
if($url){Say 'OK' "Repository exists: $url";gh repo view $full --json nameWithOwner,visibility,pushedAt,url --jq '.'}else{Say 'ERROR' "Repository not found: $full";Say 'RECOVERY' "gh repo create $full --public --description `"Multi-topic news collector and rule-based personal news collections for GitHub Pages`""}
Say 'CHECK' 'Recent repositories';gh repo list $login --limit 20 --json nameWithOwner,url,pushedAt --jq '.[] | [.nameWithOwner,.url,.pushedAt] | @tsv'
if($url){Say 'CHECK' 'Recent Actions';gh run list -R $full --limit 5;Say 'CHECK' 'Pages status';gh api "repos/$full/pages" --jq '{url:.html_url,status:.status,build_type:.build_type}' 2>$null}
Say 'OK' "Diagnostic result: $result"
exit 0
