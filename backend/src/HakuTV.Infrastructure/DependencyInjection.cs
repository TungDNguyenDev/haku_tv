using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using HakuTV.Core.Abstractions;
using HakuTV.Core.Drm;
using HakuTV.Infrastructure.Data;
using HakuTV.Infrastructure.Drm;

namespace HakuTV.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'ConnectionStrings:Default'.");

        services.AddSingleton<ISqlConnectionFactory>(new SqlConnectionFactory(connectionString));
        services.AddScoped<IContentKeyRepository, ContentKeyRepository>();
        return services;
    }
}
