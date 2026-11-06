using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Catalog;
using HakuTV.Core.Drm;
using HakuTV.Core.Identity;
using HakuTV.Core.Media;
using HakuTV.Infrastructure.Identity;
using HakuTV.Infrastructure.Catalog;
using HakuTV.Infrastructure.Data;
using HakuTV.Infrastructure.Drm;
using HakuTV.Infrastructure.Media;

namespace HakuTV.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'ConnectionStrings:Default'.");

        services.AddSingleton<ISqlConnectionFactory>(new SqlConnectionFactory(connectionString));
        services.AddScoped<IContentKeyRepository, ContentKeyRepository>();
        services.AddScoped<ICatalogQueries, CatalogQueries>();
        services.AddScoped<IPlaybackRepository, PlaybackRepository>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();
        services.AddScoped<IProfileRepository, ProfileRepository>();
        return services;
    }
}
