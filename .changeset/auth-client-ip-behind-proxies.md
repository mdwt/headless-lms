---
"@headless-lms/server": patch
"@headless-lms/adapter-auth": patch
"create-headless-lms": patch
---

Sign-in rate limits count each member separately behind a chain of proxies. The container config takes `trustedProxies` (the IPs or CIDR ranges of the proxies in front of the API) and `ipAddressHeaders` (the headers read for the client IP), and passes them to better-auth. A generated installation reads them from `AUTH_TRUSTED_PROXIES` and `AUTH_IP_ADDRESS_HEADERS`, comma-separated. Without them, every request that arrives with more than one address in `X-Forwarded-For` shares one rate limit.
