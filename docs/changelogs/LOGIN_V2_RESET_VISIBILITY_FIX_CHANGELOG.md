# Login V2 Reset Visibility Fix

## Fixed
- Removed fake mobile status bar remnants from the login layout.
- Prevented the password reset action area from being clipped on desktop and mobile viewports.
- Made the reset input/button layout compact and fully visible.
- Allowed login page vertical scroll only when the reset panel is expanded or the viewport is too short.

## Safety
- No Firebase, auth, accounting, advance, ledger, or database logic changed.
