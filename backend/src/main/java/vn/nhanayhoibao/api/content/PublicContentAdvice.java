package vn.nhanayhoibao.api.content;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=PublicContentController.class)
public class PublicContentAdvice {
    private ResponseEntity<ProblemDetail> error(HttpStatus status,String code,String message) {
        var body=ProblemDetail.forStatusAndDetail(status,message);body.setProperty("code",code);
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
    @ExceptionHandler(PublicContentException.class) ResponseEntity<ProblemDetail> domain(PublicContentException error) {
        return error(error.status,error.code,error.getMessage());
    }
    @ExceptionHandler({MethodArgumentTypeMismatchException.class,MissingServletRequestParameterException.class})
    ResponseEntity<ProblemDetail> invalid() {return error(HttpStatus.BAD_REQUEST,"INVALID_QUERY","Malformed content parameter");}
}
