using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace SentinelOps.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<MonitorEntity> Monitors => Set<MonitorEntity>();
    public DbSet<CheckResultEntity> CheckResults => Set<CheckResultEntity>();
    public DbSet<IncidentEntity> Incidents => Set<IncidentEntity>();
    public DbSet<IncidentEventEntity> IncidentEvents => Set<IncidentEventEntity>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // EF Core's SQLite provider can't translate WHERE/ORDER BY comparisons on
        // DateTimeOffset columns into SQL (a documented provider limitation — SQLite
        // has no native DateTimeOffset type). Store every DateTimeOffset as a plain
        // UTC DateTime instead; every entity/endpoint keeps using DateTimeOffset in
        // C#, this only changes what actually reaches the database.
        configurationBuilder.Properties<DateTimeOffset>()
            .HaveConversion<DateTimeOffsetToUtcDateTimeConverter>();
        configurationBuilder.Properties<DateTimeOffset?>()
            .HaveConversion<NullableDateTimeOffsetToUtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SQLite has no native array/object column types, so the small collection-typed
        // fields on MonitorEntity/IncidentEntity round-trip through JSON text columns.
        var monitor = modelBuilder.Entity<MonitorEntity>();
        monitor.Property(m => m.ExpectedStatus).HasConversion(JsonValueConverter.For<int[]>(() => []));
        monitor.Property(m => m.Headers).HasConversion(JsonValueConverter.For<Dictionary<string, string>>(() => []));
        monitor.Property(m => m.Regions).HasConversion(JsonValueConverter.For<string[]>(() => []));
        monitor.Property(m => m.Tags).HasConversion(JsonValueConverter.For<string[]>(() => []));
        monitor.Property(m => m.Assertions).HasConversion(JsonValueConverter.For<MonitorAssertion[]>(() => []));
        monitor.Property(m => m.AlertChannels).HasConversion(JsonValueConverter.For<string[]>(() => []));

        modelBuilder.Entity<IncidentEntity>()
            .Property(i => i.AffectedRegions)
            .HasConversion(JsonValueConverter.For<string[]>(() => []));

        modelBuilder.Entity<CheckResultEntity>()
            .HasIndex(c => new { c.MonitorId, c.Timestamp });
        modelBuilder.Entity<IncidentEventEntity>()
            .HasIndex(e => e.IncidentId);
    }
}

static class JsonValueConverter
{
    public static ValueConverter<T, string> For<T>(Func<T> fallback) =>
        new(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<T>(v, (JsonSerializerOptions?)null) ?? fallback());
}

class DateTimeOffsetToUtcDateTimeConverter() : ValueConverter<DateTimeOffset, DateTime>(
    v => v.UtcDateTime,
    v => new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc)));

class NullableDateTimeOffsetToUtcDateTimeConverter() : ValueConverter<DateTimeOffset?, DateTime?>(
    v => v.HasValue ? v.Value.UtcDateTime : null,
    v => v.HasValue ? new DateTimeOffset(DateTime.SpecifyKind(v.Value, DateTimeKind.Utc)) : null);
