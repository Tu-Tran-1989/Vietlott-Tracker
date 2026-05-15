# ─────────────────────────────────────────────────────────────────────────────
# schedule-task.ps1
# Run this ONCE in PowerShell (as Administrator) to register the daily bot task.
#
#   powershell -ExecutionPolicy Bypass -File schedule-task.ps1
# ─────────────────────────────────────────────────────────────────────────────

$TaskName   = "VietlottZaloBot"
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath   = (Get-Command node -ErrorAction Stop).Source
$BotScript  = Join-Path $ScriptPath "bot.js"

# ── Draw days and time ───────────────────────────────────────────────────────
# 6/45  → Mon (2), Wed (4), Fri (6)  at 20:00
# 6/55  → Tue (3), Thu (5), Sat (7)  at 20:00

$triggers = @(
  New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Wednesday,Friday    -At "20:00"
  New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday,Thursday,Saturday  -At "20:00"
)

$action   = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$BotScript`"" -WorkingDirectory $ScriptPath
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $TaskName `
  -Trigger  $triggers `
  -Action   $action `
  -Settings $settings `
  -RunLevel Highest `
  -Description "Sends Vietlott daily results to Zalo group" | Out-Null

Write-Host ""
Write-Host "✅  Task '$TaskName' registered successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Schedule:"
Write-Host "  6/45 (Mon/Wed/Fri) → 20:00"
Write-Host "  6/55 (Tue/Thu/Sat) → 20:00"
Write-Host ""
Write-Host "To test right now:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To remove:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
