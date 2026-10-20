package vn.nhanayhoibao.api.admin;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes={AdminContentController.class,FeedbackController.class,vn.nhanayhoibao.api.notifications.AdminNotificationController.class})
public class AdminContentAdvice {
    private ResponseEntity<ProblemDetail> problem(HttpStatus status,String code,String detail,Object errors) {
        var body=ProblemDetail.forStatusAndDetail(status,detail);body.setTitle(status.getReasonPhrase());body.setProperty("code",code);
        if(errors!=null)body.setProperty("errors",errors);
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
    @ExceptionHandler(AdminContentException.class) ResponseEntity<ProblemDetail> domain(AdminContentException error) {
        return problem(error.status,error.code,error.getMessage(),null);
    }
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<ProblemDetail> conflict() {
        return problem(HttpStatus.CONFLICT,"RESOURCE_CONFLICT","Duplicate identity, release label or content reference conflict",null);
    }
    @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException error) {
        List<FieldError> fields=error.getBindingResult().getFieldErrors().stream()
            .map(field->new FieldError(field.getField(),field.getDefaultMessage())).toList();
        return problem(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Request fields are invalid",fields);
    }
    @ExceptionHandler({ConstraintViolationException.class,HandlerMethodValidationException.class,
        MethodArgumentTypeMismatchException.class,HttpMessageNotReadableException.class})
    ResponseEntity<ProblemDetail> invalid() {return problem(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Malformed request or invalid parameter",null);}
    public record FieldError(String field,String message) {}
}
