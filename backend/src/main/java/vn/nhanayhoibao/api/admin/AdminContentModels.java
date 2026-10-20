package vn.nhanayhoibao.api.admin;

import jakarta.validation.constraints.*;
import java.util.*;

public final class AdminContentModels {
    private AdminContentModels() {}
    public enum RuleStatus { CONFIRMED, NEEDS_REVIEW }
    public enum PageType { STORY, RULE, GUIDE, FAQ, DEVLOG }
    public record Actor(UUID id, long authVersion) {}
    public record Page<T>(List<T> items, int page, int size, long totalElements, long totalPages) {}
    public record RevisionPage(long releaseVersion, Page<Map<String,Object>> result) {}
    public record Mutation(UUID entityId, long releaseVersion, Map<String,Object> item) {}
    public record DeleteResult(UUID entityId, long releaseVersion) {}
    public record CreateRelease(
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Za-z0-9][A-Za-z0-9._-]*") String versionLabel,
        @NotBlank @Size(max=200) String title, @Size(max=10000) String releaseNotes) {}
    public record UpdateRelease(@NotNull @PositiveOrZero Long expectedVersion,
        @NotBlank @Size(max=200) String title, @Size(max=10000) String releaseNotes) {}
    public record CloneRelease(@NotNull @PositiveOrZero Long sourceVersion,
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Za-z0-9][A-Za-z0-9._-]*") String versionLabel,
        @NotBlank @Size(max=200) String title, @Size(max=10000) String releaseNotes) {}

    // Identity fields are immutable. entityId on POST reuses an existing identity in a new draft.
    public record CharacterWrite(@NotNull @PositiveOrZero Long expectedVersion, UUID entityId,
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Z0-9][A-Z0-9_-]*") String code,
        @NotBlank @Size(max=160) @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @NotBlank @Size(max=160) String name, @NotBlank @Size(max=20000) String biography,
        @Size(max=10000) String abilityText, @Size(max=2048) String portraitUrl,
        @Min(0) @Max(100000) Integer sortOrder) {
        public Command command() { return new Command(expectedVersion,entityId,code,slug,null,
            fields("name",name,"biography",biography,"ability_text",abilityText,"portrait_url",portraitUrl,"sort_order",sortOrder==null?0:sortOrder)); }
    }
    public record SetWrite(@NotNull @PositiveOrZero Long expectedVersion, UUID entityId,
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Z0-9][A-Z0-9_-]*") String code,
        @NotBlank @Size(max=160) @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @NotBlank @Size(max=160) String name, @Size(max=10000) String description,
        @Min(0) @Max(100000) Integer sortOrder) {
        public Command command() { return new Command(expectedVersion,entityId,code,slug,null,
            fields("name",name,"description",description,"sort_order",sortOrder==null?0:sortOrder)); }
    }
    public record CardWrite(@NotNull @PositiveOrZero Long expectedVersion, UUID entityId,
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Z0-9][A-Z0-9_-]*") String code,
        @NotBlank @Size(max=160) @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @NotNull UUID cardSetId, UUID characterId,
        @NotBlank @Size(max=160) String name, @NotBlank @Size(max=10000) String effectText,
        @Size(max=10000) String rulingNotes, @NotNull RuleStatus ruleStatus,
        @Min(1) @Max(1000) int copiesInDeck, @Size(max=2048) String artworkUrl,
        @Min(0) @Max(100000) Integer sortOrder) {
        public Command command() { return new Command(expectedVersion,entityId,code,slug,null,
            fields("card_set_id",cardSetId,"character_id",characterId,"name",name,"effect_text",effectText,
                "ruling_notes",rulingNotes,"rule_status",ruleStatus.name(),"copies_in_deck",copiesInDeck,
                "artwork_url",artworkUrl,"sort_order",sortOrder==null?0:sortOrder)); }
    }
    public record WikiWrite(@NotNull @PositiveOrZero Long expectedVersion, UUID entityId,
        @NotBlank @Size(max=160) @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @NotNull PageType pageType, @NotBlank @Size(max=200) String title,
        @Size(max=1000) String summary, @NotBlank @Size(max=20000) String bodyMarkdown,
        @NotNull RuleStatus ruleStatus, @Min(0) @Max(100000) Integer sortOrder) {
        public Command command() { return new Command(expectedVersion,entityId,null,slug,pageType.name(),
            fields("title",title,"summary",summary,"body_markdown",bodyMarkdown,"rule_status",ruleStatus.name(),"sort_order",sortOrder==null?0:sortOrder)); }
    }
    public record Command(long expectedVersion, UUID entityId, String code, String slug, String pageType, Map<String,Object> fields) {}
    private static Map<String,Object> fields(Object... pairs) {
        var result = new LinkedHashMap<String,Object>();
        for (int i=0;i<pairs.length;i+=2) result.put((String)pairs[i],pairs[i+1]);
        return result;
    }
}
