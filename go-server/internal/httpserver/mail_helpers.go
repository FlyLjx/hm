package httpserver

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"html"
	"mime"
	"net"
	"net/smtp"
	"strconv"
	"strings"
)

type smtpSettings struct {
	Enabled     bool
	Host        string
	Port        int
	Secure      bool
	User        string
	Password    string
	FromName    string
	FromAddress string
	SiteName    string
}

func (s smtpSettings) validate() error {
	if !s.Enabled {
		return newAppError(400, "邮件服务未启用")
	}
	if s.Host == "" || s.User == "" || s.Password == "" {
		return newAppError(400, "邮件服务未配置完整")
	}
	return nil
}

func smtpSettingsFromMap(values map[string]any) smtpSettings {
	return smtpSettings{
		Enabled:     anyBool(values["emailEnabled"]),
		Host:        strings.TrimSpace(anyString(values["emailHost"])),
		Port:        anyInt(values["emailPort"], 465),
		Secure:      anyBool(values["emailSecure"]),
		User:        strings.TrimSpace(anyString(values["emailUser"])),
		Password:    anyString(values["emailPassword"]),
		FromName:    strings.TrimSpace(anyString(values["emailFromName"])),
		FromAddress: strings.TrimSpace(anyString(values["emailFromAddress"])),
		SiteName:    strings.TrimSpace(anyString(values["siteName"])),
	}
}

func sendSMTPMail(settings smtpSettings, to string, subject string, text string) error {
	if err := settings.validate(); err != nil {
		return err
	}
	to = strings.TrimSpace(to)
	if to == "" {
		return newAppError(400, "收件邮箱为空")
	}
	fromAddress := settings.FromAddress
	if fromAddress == "" {
		fromAddress = settings.User
	}
	fromName := settings.FromName
	if fromName == "" {
		fromName = settings.SiteName
	}
	if fromName == "" {
		fromName = "AIπ"
	}
	addr := net.JoinHostPort(settings.Host, strconv.Itoa(settings.Port))
	auth := smtp.PlainAuth("", settings.User, settings.Password, settings.Host)
	message := buildMailMessage(fromName, fromAddress, to, subject, text)
	if settings.Secure {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: settings.Host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return newAppError(502, "邮件服务器连接失败："+err.Error())
		}
		defer conn.Close()
		client, err := smtp.NewClient(conn, settings.Host)
		if err != nil {
			return newAppError(502, "邮件客户端初始化失败："+err.Error())
		}
		defer client.Close()
		if err := client.Auth(auth); err != nil {
			return newAppError(502, smtpAuthErrorMessage(settings, err))
		}
		return smtpSend(client, fromAddress, to, message)
	}
	client, err := smtp.Dial(addr)
	if err != nil {
		return newAppError(502, "邮件服务器连接失败："+err.Error())
	}
	defer client.Close()
	if err := client.StartTLS(&tls.Config{ServerName: settings.Host, MinVersion: tls.VersionTLS12}); err == nil {
		if authErr := client.Auth(auth); authErr != nil {
			return newAppError(502, smtpAuthErrorMessage(settings, authErr))
		}
	} else if authErr := client.Auth(auth); authErr != nil {
		return newAppError(502, smtpAuthErrorMessage(settings, authErr))
	}
	return smtpSend(client, fromAddress, to, message)
}

func smtpAuthErrorMessage(settings smtpSettings, err error) string {
	detail := ""
	if err != nil {
		detail = err.Error()
	}
	host := strings.ToLower(settings.Host)
	if strings.Contains(detail, "535") || strings.Contains(host, "qq.com") {
		return "邮件登录失败：SMTP 账号或授权码不正确，或邮箱未开启 SMTP 服务。QQ 邮箱请在邮箱设置中开启 POP3/SMTP，并使用生成的“授权码”，不要填写 QQ 登录密码。原始错误：" + detail
	}
	return "邮件登录失败：" + detail
}

func smtpSend(client *smtp.Client, from string, to string, message []byte) error {
	if err := client.Mail(from); err != nil {
		return newAppError(502, "邮件发件人被拒绝："+err.Error())
	}
	if err := client.Rcpt(to); err != nil {
		return newAppError(502, "邮件收件人被拒绝："+err.Error())
	}
	writer, err := client.Data()
	if err != nil {
		return newAppError(502, "邮件内容发送失败："+err.Error())
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return newAppError(502, "邮件内容发送失败："+err.Error())
	}
	if err := writer.Close(); err != nil {
		return newAppError(502, "邮件发送失败："+err.Error())
	}
	return client.Quit()
}

func buildMailMessage(fromName string, fromAddress string, to string, subject string, text string) []byte {
	boundary := "aipi-mail-" + newID()
	encodedSubject := mime.QEncoding.Encode("utf-8", subject)
	encodedFromName := mime.QEncoding.Encode("utf-8", fromName)
	htmlBody := `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#172033;white-space:pre-wrap;">` + html.EscapeString(text) + `</div>`
	var buffer bytes.Buffer
	buffer.WriteString("From: " + encodedFromName + " <" + fromAddress + ">\r\n")
	buffer.WriteString("To: " + to + "\r\n")
	buffer.WriteString("Subject: " + encodedSubject + "\r\n")
	buffer.WriteString("MIME-Version: 1.0\r\n")
	buffer.WriteString("Content-Type: multipart/alternative; boundary=" + boundary + "\r\n\r\n")
	writeMailPart(&buffer, boundary, "text/plain; charset=utf-8", text)
	writeMailPart(&buffer, boundary, "text/html; charset=utf-8", htmlBody)
	buffer.WriteString("--" + boundary + "--\r\n")
	return buffer.Bytes()
}

func writeMailPart(buffer *bytes.Buffer, boundary string, contentType string, body string) {
	buffer.WriteString("--" + boundary + "\r\n")
	buffer.WriteString("Content-Type: " + contentType + "\r\n")
	buffer.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	encoded := base64.StdEncoding.EncodeToString([]byte(body))
	for len(encoded) > 76 {
		buffer.WriteString(encoded[:76] + "\r\n")
		encoded = encoded[76:]
	}
	buffer.WriteString(encoded + "\r\n\r\n")
}

func anyBool(value any) bool {
	switch item := value.(type) {
	case bool:
		return item
	case string:
		return strings.EqualFold(strings.TrimSpace(item), "true") || strings.TrimSpace(item) == "1"
	case float64:
		return item != 0
	case int:
		return item != 0
	default:
		return false
	}
}

func anyInt(value any, fallback int) int {
	switch item := value.(type) {
	case int:
		return item
	case float64:
		return int(item)
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(item)); err == nil {
			return parsed
		}
	}
	return fallback
}

func anyFloat(value any, fallback float64) float64 {
	switch item := value.(type) {
	case float64:
		return item
	case int:
		return float64(item)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(item), 64); err == nil {
			return parsed
		}
	}
	return fallback
}

func formatMailFailure(email string, err error) map[string]string {
	message := "发送失败"
	if err != nil {
		message = err.Error()
	}
	return map[string]string{"email": email, "message": message}
}

func smtpSummary(total int, success int, failed int) string {
	return fmt.Sprintf("已处理 %d 个收件人，成功 %d 个，失败 %d 个", total, success, failed)
}
