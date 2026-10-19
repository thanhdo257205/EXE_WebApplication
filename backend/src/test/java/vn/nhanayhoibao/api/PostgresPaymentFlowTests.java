package vn.nhanayhoibao.api;

import java.sql.*;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Same service transactions against PostgreSQL, confined to a generated disposable schema. */
@EnabledIfEnvironmentVariable(named="SCHEMA_TEST_JDBC_URL",matches=".+")
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class PostgresPaymentFlowTests extends PaymentFlowTests {
    static final String SCHEMA="exe_payment_test_"+UUID.randomUUID().toString().replace("-","").substring(0,12);
    @DynamicPropertySource static void postgres(DynamicPropertyRegistry registry) {
        String url=System.getenv("SCHEMA_TEST_JDBC_URL");
        registry.add("spring.datasource.url",()->url+(url.contains("?")?"&":"?")+"currentSchema="+SCHEMA);
        registry.add("spring.datasource.username",()->System.getenv("SCHEMA_TEST_USERNAME"));
        registry.add("spring.datasource.password",()->System.getenv("SCHEMA_TEST_PASSWORD"));
        registry.add("spring.datasource.hikari.maximum-pool-size",()->3);
        registry.add("spring.flyway.schemas",()->SCHEMA);
        registry.add("spring.flyway.default-schema",()->SCHEMA);
        registry.add("spring.jpa.properties.hibernate.default_schema",()->SCHEMA);
    }
    @AfterAll static void cleanupSchema() throws SQLException {
        if(!SCHEMA.matches("exe_payment_test_[a-f0-9]{12}"))throw new IllegalStateException("Unsafe test schema");
        try(var c=DriverManager.getConnection(System.getenv("SCHEMA_TEST_JDBC_URL"),System.getenv("SCHEMA_TEST_USERNAME"),System.getenv("SCHEMA_TEST_PASSWORD"));var s=c.createStatement()){
            s.execute("DROP SCHEMA IF EXISTS "+SCHEMA+" CASCADE");
        }
    }
}
