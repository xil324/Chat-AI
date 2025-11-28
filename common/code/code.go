package code



type Code int64

const (
	CodeSuccess Code = 1000

	CodeInvalidParams    Code = 2001
	CodeUserExist        Code = 2002
	CodeUserNotExist     Code = 2003
	CodeInvalidPassword  Code = 2004
	CodeNotMatchPassword Code = 2005
	CodeInvalidToken     Code = 2006
	CodeNotLogin         Code = 2007
	CodeInvalidCaptcha   Code = 2008
	CodeRecordNotFound   Code = 2009
	CodeIllegalPassword  Code = 2010

	CodeForbidden Code = 3001

	CodeServerBusy Code = 4001

	AIModelNotFind    Code = 5001
	AIModelCannotOpen Code = 5002
	AIModelFail       Code = 5003
)

var msg = map[Code]string{
	CodeSuccess: "success",

	CodeInvalidParams:    "Invalid request parameters",
	CodeUserExist:        "Username already exists",
	CodeUserNotExist:     "User does not exist",
	CodeInvalidPassword:  "Username or password is incorrect",
	CodeNotMatchPassword: "Passwords do not match",
	CodeInvalidToken:     "Invalid token",
	CodeNotLogin:         "User is not logged in",
	CodeInvalidCaptcha:   "Invalid captcha",
	CodeRecordNotFound:   "Record not found",
	CodeIllegalPassword:  "Password is not valid",

	CodeForbidden: "Insufficient permissions",

	CodeServerBusy: "Server is busy",

	AIModelNotFind:    "Model does not exist",
	AIModelCannotOpen: "Model cannot be opened",
	AIModelFail:       "Model run failed",
}

func (code Code) Code() int64 {
	return int64(code)
}

func (code Code) Msg() string {
	if m, ok := msg[code]; ok {
		return m
	}
	return msg[CodeServerBusy]
}
