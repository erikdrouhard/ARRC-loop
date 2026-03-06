# Schema ARC Trace

## Draft
```json
{
  "action": "sendEmail",
  "to": "user@example.com",
  "subject": "Welcome",
  "body": "Hello {{name}}, welcome aboard."
}
```

## Rebuttal
"The schema is syntactically valid but has three issues:
1. `{{name}}` is a template variable with no fallback — if name is missing, the email sends with a raw placeholder.
2. There is no `replyTo` field, which is required by the downstream mailer.
3. The `body` field allows arbitrary injection if name is not sanitized."

## Verifier result
- missing fallback for `{{name}}`: valid
- missing `replyTo` field: valid (confirmed against mailer contract)
- injection risk in `body`: partially valid (depends on downstream sanitization)

## Revision
```json
{
  "action": "sendEmail",
  "to": "user@example.com",
  "replyTo": "support@example.com",
  "subject": "Welcome",
  "body": "Hello {{name | default: 'there'}}, welcome aboard."
}
```

## ARC Judge decision
- decision: revise
- confidence: 0.91
- accepted rebuttals:
  - missing fallback for template variable
  - missing required `replyTo` field
- rejected rebuttals:
  - injection risk (handled by downstream sanitization layer)

## Why this matters
A validator would have passed this schema because it is syntactically correct.
ARC Judge caught that the schema was not yet safe to hand off to the generation step.
