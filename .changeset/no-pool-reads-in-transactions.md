---
"@headless-lms/core": patch
---

Sending a chat message, starting a direct chat, landing a post with mentions (submit, approve, scheduled publish), approving a comment with mentions and changing an invited person's role no longer read through another service while their transaction holds a database connection. Each of these held one pooled connection for its transaction and waited for a second; with the pool's default of 10 connections, 20 concurrent chat sends on one instance left every connection idle in a transaction and the instance stopped answering anything that touches the database. The reads now happen before the transaction: who in the chat is team, the attachment owner check, who can open the space or lesson, and the invitee's account. A send that finds someone in the chat it did not check is refused with 409 "This chat changed while you were sending; send again".
