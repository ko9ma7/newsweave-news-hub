$ErrorActionPreference = 'Stop'
# PowerShell 7+ can promote native non-zero exit codes to errors.
# We inspect $LASTEXITCODE ourselves so expected probe failures remain non-fatal.
$PSNativeCommandUseErrorActionPreference = $false
Set-Location (Split-Path -Parent $PSScriptRoot)

$repoName = if ($env:NW_REPO_NAME) { $env:NW_REPO_NAME } else { 'newsweave-news-hub' }
$repoOwner = $env:NW_REPO_OWNER
$repoDescription = if ($env:NW_REPO_DESCRIPTION) { $env:NW_REPO_DESCRIPTION } else { 'Multi-topic news collector and rule-based personal news collections for GitHub Pages' }
$repoVisibility = if ($env:NW_REPO_VISIBILITY) { $env:NW_REPO_VISIBILITY.ToLowerInvariant() } else { 'public' }
$branch = if ($env:NW_DEFAULT_BRANCH) { $env:NW_DEFAULT_BRANCH } else { 'main' }
$initialTag = if ($env:NW_INITIAL_TAG) { $env:NW_INITIAL_TAG } else { 'v1.0.3' }
$initialCommit = if ($env:NW_INITIAL_COMMIT) { $env:NW_INITIAL_COMMIT } else { 'feat: launch NewsWeave multi-topic news collector' }
$updateCommit = if ($env:NW_UPDATE_COMMIT) { $env:NW_UPDATE_COMMIT } else { 'chore: provision NewsWeave GitHub repository' }
$topics = if ($env:NW_TOPICS) { $env:NW_TOPICS -split '\s+' | Where-Object { $_ } } else { @('news','rss','github-pages') }
$customSiteUrl = $env:NW_CUSTOM_SITE_URL
$autoInstall = $env:NW_AUTO_INSTALL -ne '0'
$createRelease = $env:NW_CREATE_RELEASE -ne '0'
$openRepo = $env:NW_OPEN_REPO -ne '0'
$workflow = 'deploy.yml'
$logFile = Join-Path (Get-Location) 'github-bootstrap.log'
$resultFile = Join-Path (Get-Location) 'github-bootstrap-result.txt'

Set-Content -LiteralPath $logFile -Value "NewsWeave GitHub Bootstrap v1.0.3`r`nStarted: $(Get-Date -Format o)`r`nFolder: $(Get-Location)" -Encoding UTF8
Set-Content -LiteralPath $resultFile -Value "NewsWeave GitHub Bootstrap v1.0.3`r`nStarted: $(Get-Date -Format o)`r`nFolder: $(Get-Location)" -Encoding UTF8

function Status([string]$kind,[string]$message) {
  Write-Host "[$kind] $message"
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] [$kind] $message" -Encoding UTF8
}
function Result([string]$message) { Add-Content -LiteralPath $resultFile -Value $message -Encoding UTF8 }
function Fail([string]$message,[string[]]$recovery=@()) {
  Status 'ERROR' $message
  foreach($r in $recovery) { Write-Host "[RECOVERY] $r"; Add-Content -LiteralPath $logFile -Value "[RECOVERY] $r" -Encoding UTF8 }
  throw $message
}
function Has([string]$command) { return [bool](Get-Command $command -ErrorAction SilentlyContinue) }
function Run([string]$file,[string[]]$arguments,[switch]$AllowFailure,[switch]$Quiet) {
  if (-not $Quiet) { Status 'CHECK' ("{0} {1}" -f $file, ($arguments -join ' ')) }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $file @arguments
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($code -ne 0 -and -not $AllowFailure) { Fail "$file exited with code $code." @("$file $($arguments -join ' ')") }
  return $code
}
function Capture([string]$file,[string[]]$arguments,[switch]$AllowFailure) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = @()
  $code = 0
  try {
    $out = & $file @arguments 2>$null
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($code -ne 0) {
    # IMPORTANT: probe-style commands such as `gh api repos/OWNER/REPO`
    # can emit a JSON error body (for example HTTP 404) even though the
    # command failed. Never return that body as if it were a successful value.
    if ($AllowFailure) { return '' }
    Fail "$file exited with code $code." @("$file $($arguments -join ' ')")
  }
  return ($out | Out-String).Trim()
}
function Is-GitHubRepoUrl([string]$value,[string]$owner,[string]$name) {
  if (-not $value) { return $false }
  $expected = "https://github.com/$owner/$name"
  return $value.TrimEnd('/') -ieq $expected
}
function Probe([string]$file,[string[]]$arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $file @arguments *> $null
    return $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}
function Ensure-Command([string]$command,[string]$wingetId,[string]$label) {
  Status 'CHECK' "$label installation"
  if (Has $command) { Status 'OK' "$label found: $(Capture $command @('--version') -AllowFailure)"; return }
  if (-not $autoInstall) { Fail "$label is missing." @("winget install --id $wingetId -e") }
  if (-not (Has 'winget')) { Fail "$label is missing and winget is unavailable." @("Install $label manually, reopen this folder, and run github-bootstrap.cmd again.") }
  Status 'WARN' "$label is missing. Installing with winget..."
  & winget install --id $wingetId -e --source winget --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { Fail "winget could not install $label." @("winget install --id $wingetId -e") }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  if (-not (Has $command)) { Fail "$label was installed but is not visible in this process yet." @('Close this window and run github-bootstrap.cmd again.') }
  Status 'OK' "$label installed."
}

try {
  Status 'CHECK' 'NewsWeave project marker and required files'
  foreach($f in @('.newsweave-project','package.json','index.html','collections.html','.github/workflows/deploy.yml','tools/smoke-test.js')) {
    if (-not (Test-Path -LiteralPath $f)) { Fail "Missing required project file: $f" @('Extract the complete NewsWeave ZIP.','Run github-bootstrap.cmd from inside the extracted newsweave folder.') }
  }
  Status 'OK' 'NewsWeave project root verified.'

  Ensure-Command 'git' 'Git.Git' 'Git'
  Ensure-Command 'node' 'OpenJS.NodeJS.LTS' 'Node.js'
  if (-not (Has 'npm')) { Fail 'npm is missing.' @('winget install --id OpenJS.NodeJS.LTS -e') }
  Ensure-Command 'gh' 'GitHub.cli' 'GitHub CLI'

  Status 'CHECK' 'GitHub CLI authentication'
  & gh auth status --active -h github.com
  if ($LASTEXITCODE -ne 0) {
    Status 'WARN' 'GitHub CLI is not logged in. Browser login / 2FA will start.'
    & gh auth login -h github.com -p https -s repo,workflow -w
    if ($LASTEXITCODE -ne 0) { Fail 'GitHub authentication did not complete.' @('gh auth login -h github.com -p https -s repo,workflow -w') }
  }
  $login = Capture 'gh' @('api','user','--jq','.login')
  if (-not $login) { Fail 'Could not resolve the active GitHub account.' @('gh auth status --active -h github.com','gh auth switch -h github.com') }
  Status 'OK' "ACTIVE GitHub account: $login"
  Result "Active GitHub account: $login"
  & gh auth setup-git -h github.com *> $null

  if (-not $repoOwner) { $repoOwner = $login }
  $fullRepo = "$repoOwner/$repoName"
  $expectedOrigin = "https://github.com/$fullRepo.git"
  Status 'OK' "Target NEW repository: $fullRepo"
  Result "Target repository: $fullRepo"

  Status 'CHECK' 'Local Git repository'
  if (-not (Test-Path '.git')) { Run 'git' @('init') | Out-Null }
  Run 'git' @('branch','-M',$branch) -Quiet | Out-Null
  $origin = ''
  $remoteNames = Capture 'git' @('remote') -AllowFailure
  if (($remoteNames -split "`r?`n") -contains 'origin') {
    $origin = Capture 'git' @('remote','get-url','origin') -AllowFailure
  } else {
    Status 'OK' 'No origin remote yet; this is normal for a new repository.'
  }
  if ($origin) {
    $accepted = @($expectedOrigin,"https://github.com/$fullRepo","git@github.com:$fullRepo.git")
    if ($accepted -notcontains $origin) { Fail "Existing origin points somewhere else: $origin" @('git remote rename origin previous-origin','Run github-bootstrap.cmd again.') }
    Status 'OK' "Existing origin matches target: $origin"
  }

  Status 'CHECK' 'Git user identity'
  $gitName = Capture 'git' @('config','--get','user.name') -AllowFailure
  $gitEmail = Capture 'git' @('config','--get','user.email') -AllowFailure
  if (-not $gitName) { $gitName = Capture 'gh' @('api','user','--jq','.name // .login'); Run 'git' @('config','user.name',$gitName) -Quiet | Out-Null }
  if (-not $gitEmail) { $uid = Capture 'gh' @('api','user','--jq','.id'); $gitEmail = "$uid+$login@users.noreply.github.com"; Run 'git' @('config','user.email',$gitEmail) -Quiet | Out-Null }
  Status 'OK' "Git identity: $gitName <$gitEmail>"

  Status 'CHECK' "GitHub repository existence: $fullRepo"
  $repoUrl = Capture 'gh' @('api',"repos/$fullRepo",'--jq','.html_url') -AllowFailure
  if ($repoUrl -and -not (Is-GitHubRepoUrl $repoUrl $repoOwner $repoName)) {
    Status 'WARN' "Ignoring invalid repository probe output: $repoUrl"
    $repoUrl = ''
  }
  if (-not $repoUrl) {
    Status 'OK' 'Repository does not exist yet; this is normal for first bootstrap.'
    Status 'CHECK' "Creating standalone repository $fullRepo as $repoVisibility"
    $visFlag = "--$repoVisibility"
    Run 'gh' @('repo','create',$fullRepo,$visFlag,'--description',$repoDescription) | Out-Null
    # GitHub's API is usually immediately consistent, but allow a short retry window.
    for($i=0; $i -lt 10 -and -not $repoUrl; $i++) {
      Start-Sleep -Seconds 2
      $candidate = Capture 'gh' @('api',"repos/$fullRepo",'--jq','.html_url') -AllowFailure
      if (Is-GitHubRepoUrl $candidate $repoOwner $repoName) { $repoUrl = $candidate }
    }
  }
  if (-not (Is-GitHubRepoUrl $repoUrl $repoOwner $repoName)) {
    Fail 'Repository creation command returned but GitHub API cannot verify the expected repository URL.' @("gh repo view $fullRepo --web","gh repo create $fullRepo --$repoVisibility --description `"$repoDescription`"")
  }
  Status 'OK' "VERIFIED repository exists: $repoUrl"
  Result "Verified repository: $repoUrl"
  if ($openRepo -and (Is-GitHubRepoUrl $repoUrl $repoOwner $repoName)) { Start-Process $repoUrl }
  if (-not $origin) { Run 'git' @('remote','add','origin',$expectedOrigin) -Quiet | Out-Null }
  & gh repo set-default $fullRepo *> $null

  $deployUrl = if ($customSiteUrl) { $customSiteUrl } elseif ($repoName -ieq "$repoOwner.github.io") { "https://$repoOwner.github.io/" } else { "https://$repoOwner.github.io/$repoName/" }
  if (-not $deployUrl.EndsWith('/')) { $deployUrl += '/' }
  Status 'OK' "Deployment URL: $deployUrl"

  Run 'node' @('tools/update-readme-deploy.js',$deployUrl) | Out-Null
  Status 'CHECK' 'Dependencies, build and tests'
  if (Test-Path 'package-lock.json') { Run 'npm' @('ci') | Out-Null } else { Run 'npm' @('install') | Out-Null }
  $env:SITE_URL = $deployUrl
  Run 'npm' @('run','build') | Out-Null
  Run 'npm' @('run','collect:test') | Out-Null
  Run 'npm' @('run','test:smoke') | Out-Null
  Status 'OK' 'Build and tests passed.'

  Run 'git' @('add','-A') -Quiet | Out-Null
  $diffCode = Probe 'git' @('diff','--cached','--quiet')
  if ($diffCode -ne 0) {
    $headCode = Probe 'git' @('rev-parse','--verify','HEAD')
    $message = if ($headCode -ne 0) { $initialCommit } else { $updateCommit }
    Run 'git' @('commit','-m',$message) | Out-Null
    Status 'OK' "Commit created: $message"
  } else {
    $headCode = Probe 'git' @('rev-parse','--verify','HEAD')
    if ($headCode -ne 0) { Fail 'No commit exists and nothing is staged.' }
    Status 'OK' 'No new local changes to commit.'
  }

  $remoteMain = Capture 'git' @('ls-remote','--heads','origin',$branch) -AllowFailure
  if ($remoteMain) {
    Status 'CHECK' "Synchronizing existing origin/$branch without force push"
    Run 'git' @('fetch','origin',$branch) | Out-Null
    $ancestorCode = Probe 'git' @('merge-base','--is-ancestor',"origin/$branch",'HEAD')
    if ($ancestorCode -ne 0) { Run 'git' @('pull','--rebase','origin',$branch) | Out-Null }
  }
  Run 'git' @('push','-u','origin',$branch) | Out-Null
  $sha = Capture 'git' @('rev-parse','HEAD')
  Start-Sleep -Seconds 2
  $verifiedSha = Capture 'gh' @('api',"repos/$fullRepo/commits/$sha",'--jq','.sha') -AllowFailure
  if (-not $verifiedSha) { Fail "Push returned but commit $sha could not be verified on GitHub." @("gh api repos/$fullRepo/commits/$sha --jq .sha") }
  Status 'OK' "VERIFIED commit is on GitHub: $verifiedSha"
  Result "Verified commit: $verifiedSha"

  Status 'CHECK' 'Repository description, homepage, topics and SITE_URL'
  & gh repo edit $fullRepo --description $repoDescription --homepage $deployUrl *> $null
  foreach($topic in $topics) { & gh repo edit $fullRepo --add-topic $topic *> $null }
  & gh repo edit $fullRepo --default-branch $branch *> $null
  & gh variable set SITE_URL -R $fullRepo --body $deployUrl *> $null
  Status 'OK' 'Repository metadata configured.'

  Status 'CHECK' 'GitHub Pages workflow source'
  $pagesCode = Probe 'gh' @('api',"repos/$fullRepo/pages")
  if ($pagesCode -ne 0) { Run 'gh' @('api','-X','POST',"repos/$fullRepo/pages",'-f','build_type=workflow') -Quiet | Out-Null }
  else { Run 'gh' @('api','-X','PUT',"repos/$fullRepo/pages",'-f','build_type=workflow') -Quiet | Out-Null }
  & gh workflow enable $workflow -R $fullRepo *> $null

  Status 'CHECK' 'Locating GitHub Actions deployment run'
  $runId = ''
  for($i=0;$i -lt 20 -and -not $runId;$i++) {
    $runId = Capture 'gh' @('run','list','-R',$fullRepo,'-w',$workflow,'-c',$sha,'-L','1','--json','databaseId','--jq','.[0].databaseId') -AllowFailure
    if (-not $runId) { Start-Sleep -Seconds 3 }
  }
  if (-not $runId) {
    Status 'WARN' 'Push-triggered workflow was not found; dispatching manually.'
    Run 'gh' @('workflow','run',$workflow,'-R',$fullRepo,'-r',$branch) | Out-Null
    for($i=0;$i -lt 20 -and -not $runId;$i++) {
      $runId = Capture 'gh' @('run','list','-R',$fullRepo,'-w',$workflow,'-L','1','--json','databaseId','--jq','.[0].databaseId') -AllowFailure
      if (-not $runId) { Start-Sleep -Seconds 3 }
    }
  }
  if (-not $runId) { Fail 'Could not locate a deployment workflow run.' @("gh run list -R $fullRepo -w $workflow") }
  Status 'OK' "Deployment run ID: $runId"
  Run 'gh' @('run','watch',$runId,'-R',$fullRepo,'--compact','--exit-status','--interval','5') | Out-Null
  $actual = Capture 'gh' @('api',"repos/$fullRepo/pages",'--jq','.html_url // empty') -AllowFailure
  if ($actual) { $deployUrl = $actual; if (-not $deployUrl.EndsWith('/')) { $deployUrl += '/' } }
  Status 'OK' "Deployment completed: $deployUrl"
  Result "Deployment: $deployUrl"

  if ($createRelease) {
    Status 'CHECK' "Initial tag / release: $initialTag"
    & git fetch origin $branch *> $null
    & git merge --ff-only "origin/$branch" *> $null
    $remoteTag = Capture 'git' @('ls-remote','--tags','origin',"refs/tags/$initialTag") -AllowFailure
    if (-not $remoteTag) {
      $localTagCode = Probe 'git' @('rev-parse',"refs/tags/$initialTag")
      if ($localTagCode -ne 0) { Run 'git' @('tag','-a',$initialTag,'-m','Initial NewsWeave GitHub Pages deployment') | Out-Null }
      Run 'git' @('push','origin',$initialTag) | Out-Null
    }
    $releaseCode = Probe 'gh' @('release','view',$initialTag,'-R',$fullRepo)
    if ($releaseCode -ne 0) { Run 'gh' @('release','create',$initialTag,'-R',$fullRepo,'--title',"NewsWeave $initialTag",'--notes','Initial GitHub Pages deployment of NewsWeave.') | Out-Null }
  }

  Result 'Status: SUCCESS'
  Result "Repository: $repoUrl"
  Result "Deployment: $deployUrl"
  Status 'OK' 'VERIFIED GitHub bootstrap completed successfully.'
  Write-Host "[OK] Active user : $login"
  Write-Host "[OK] Repository  : $repoUrl"
  Write-Host "[OK] Deployment  : $deployUrl"
  Write-Host "[OK] Branch      : $branch"
  Write-Host "[OK] Release     : $initialTag"
  exit 0
}
catch {
  Result 'Status: FAILED'
  Result "Error: $($_.Exception.Message)"
  Status 'ERROR' $_.Exception.Message
  Write-Host "[RECOVERY] Run github-diagnose.cmd from this same NewsWeave folder."
  Write-Host "[RECOVERY] Open github-bootstrap.log for the exact failing stage."
  exit 1
}
