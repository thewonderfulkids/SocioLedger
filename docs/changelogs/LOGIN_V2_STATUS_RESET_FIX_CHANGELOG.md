# Login V2 Status + Reset Fix

## Changes
- Removed fake fixed mobile status bar values (`9:41`, `Wi-Fi`, `100`) from login screen.
- Fixed Password Reset Request alignment.
- Made Forgot Password toggle the reset request panel.
- Made reset request panel clickable via custom controlled open state.
- Restored reset mobile input + reset button visibility on small screens when panel is open.
- No accounting, advance, Firebase, or dashboard logic changed.

## Build Verification
- `npm run build` completed successfully.
