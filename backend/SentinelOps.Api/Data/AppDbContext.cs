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
    public DbSet<AgentEntity> Agents => Set<AgentEntity>();
    public DbSet<MonitorRegionStateEntity> MonitorRegionStates => Set<MonitorRegionStateEntity>();
    public DbSet<SettingsEntity> Settings => Set<SettingsEntity>();
    public DbSet<NotificationChannelEntity> NotificationChannels => Set<NotificationChannelEntity>();

    // PostgreSQL handles DateTimeOffset (timestamptz) and arrays natively,
    // so we don't need the DateTimeOffset→DateTime converter or JSON-string converters
    // that SQLite required. The only conversion we keep is for complex types
    // (records, dictionaries) that get stored as jsonb.

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var monitor = modelBuilder.Entity<MonitorEntity>();

        // PostgreSQL native arrays: int[] → integer[], string[] → text[]
        // No converter needed — Npgsql handles these automatically.
        monitor.Property(m => m.ExpectedStatus).HasColumnType("integer[]");
        monitor.Property(m => m.Regions).HasColumnType("text[]");
        monitor.Property(m => m.Tags).HasColumnType("text[]");
        monitor.Property(m => m.AlertChannels).HasColumnType("text[]");

        // Complex types stored as jsonb
        monitor.Property(m => m.Headers)
            .HasColumnType("jsonb")
            .HasConversion(JsonValueConverter.For<Dictionary<string, string>>(() => []));
        monitor.Property(m => m.Assertions)
            .HasColumnType("jsonb")
            .HasConversion(JsonValueConverter.For<MonitorAssertion[]>(() => []));

        modelBuilder.Entity<IncidentEntity>()
            .Property(i => i.AffectedRegions)
            .HasColumnType("text[]");

        modelBuilder.Entity<CheckResultEntity>()
            .HasIndex(c => new { c.MonitorId, c.Timestamp });
        modelBuilder.Entity<IncidentEventEntity>()
            .HasIndex(e => e.IncidentId);

        modelBuilder.Entity<MonitorRegionStateEntity>()
            .HasKey(s => new { s.MonitorId, s.RegionId });

        modelBuilder.Entity<SettingsEntity>()
            .Property(s => s.DefaultRegions)
            .HasColumnType("text[]");
    }
}

static class JsonValueConverter
{
    public static ValueConverter<T, string> For<T>(Func<T> fallback) =>
        new(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => JsonSerializer.Deserialize<T>(v, (JsonSerializerOptions?)null) ?? fallback());
}
