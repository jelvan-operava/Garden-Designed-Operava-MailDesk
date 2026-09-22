# OPERAVA MailDesk - Email Components

> **Email Management System for OPERAVA Global Solutions**
> www.operavaglobal.com

**Brand:** OPERAVA MailDesk  
**Theme:** Light Gray `#E5E7EB` + Purple-Orange Gradient `#8B5CF6 → #F97316`

---

## 🌐 About Operava Global Solutions
**OPERAVA Global Solutions** - Automation, Technology and Global Business Outsourcing Solutions.
Website: **www.operavaglobal.com**
© All rights reserved, system owned and developed internally by OPERAVA GLOBAL SOLUTIONS.

## 📦 Components
1. **Login Page** - Minimalist, only Email Sign-In (no SSO), animated orbs, gradient icons
2. **MailDesk App** - Dashboard (Total Sent, Today, Last 7 Days, 1 Month + Live Date/Time KL + Movable Sticky Notes for motivational/family pictures), Inbox, Sent with custom folders & drag & drop, Outbox "Unable to send", Scheduled, Templates, Notes, Trash, Profile/Settings with Write/HTML Raw toggle

## 🎨 Design
- Bg #f8f5e9, Card #fff, Primary #E5E7EB, Border #e7e5d8, Text #374151
- Gradient: linear-gradient(135deg, #8B5CF6 0%, #A855F7 25%, #F97316 75%, #FB923C 100%) for ALL icons
- Fonts: Playfair Display 22px logo, Inter 14px body, JetBrains Mono 13px code
- Sidebar 280px, Top Bar 64px, Card radius 16px

## 🚀 Backend Stack (Recommended)
- GitHub + Cloudflare Pages (frontend) + Cloudflare Workers (Hono.js API) + Supabase (Auth, DB, Storage) + Resend (sending + webhooks)

Full docs in `OPERAVA_MailDesk_Documentation.txt` and backend artifact.

## 🛠️ Dev
No build - just open HTML files. localStorage keys: operava-emails-v1, operava-board-v1, operava-auth
