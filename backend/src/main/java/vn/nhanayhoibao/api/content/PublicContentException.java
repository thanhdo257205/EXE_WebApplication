package vn.nhanayhoibao.api.content;

import org.springframework.http.HttpStatus;

public class PublicContentException extends RuntimeException {
    final HttpStatus status;
    final String code;
    PublicContentException(HttpStatus status,String code,String message) {
        super(message);this.status=status;this.code=code;
    }
    static PublicContentException missing() {
        return new PublicContentException(HttpStatus.NOT_FOUND,"CONTENT_NOT_FOUND","Published content was not found");
    }
    static PublicContentException query() {
        return new PublicContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","Invalid content query or filter");
    }
}
