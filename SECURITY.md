# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | ✅ Yes             |
| older   | ❌ No              |

## Reporting a Vulnerability

If you discover a security vulnerability in **hotelkey-project**, please do **NOT** open a public GitHub issue.

Instead, report it privately:

- **Email:** emma.tobi1@gmail.com
- **Response time:** Within 48 hours
- **Resolution target:** Critical issues patched within 7 days

Please include:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

## Security Measures

This project follows these security practices:
- Dependency scanning via Dependabot + npm audit
- Static analysis via Semgrep + CodeQL
- Container scanning via Trivy
- Secret detection via Gitleaks
- Dynamic scanning via OWASP ZAP
- IaC scanning via Checkov (Terraform/AWS)

## Scope

In scope:
- API authentication and authorization flaws
- Injection vulnerabilities (SQL, NoSQL, command)
- Sensitive data exposure
- Broken access control
- Security misconfigurations

Out of scope:
- Social engineering attacks
- Physical security issues
