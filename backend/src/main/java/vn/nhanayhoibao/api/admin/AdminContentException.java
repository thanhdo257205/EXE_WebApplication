package vn.nhanayhoibao.api.admin;

import org.springframework.http.HttpStatus;

public class AdminContentException extends RuntimeException {
    final HttpStatus status;
    final String code;
    public AdminContentException(HttpStatus status, String code, String message) { super(message); this.status=status; this.code=code; }
    static AdminContentException missing() { return new AdminContentException(HttpStatus.NOT_FOUND,"NOT_FOUND","Content resource not found"); }
    static AdminContentException conflict(String code,String message) { return new AdminContentException(HttpStatus.CONFLICT,code,message); }
}
