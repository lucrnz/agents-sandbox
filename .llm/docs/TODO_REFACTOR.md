# TODO_REFACTOR

## Replace literal "🤔 Thinking..." comparisons

Several frontend checks rely on literal string comparisons against "🤔 Thinking..." to detect in-progress responses. This is brittle and causes UI logic to depend on message content. Replace these checks with an explicit message status flag (or derived metadata) so the UI can reliably detect active generations without relying on literal text.
