using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using HakuTV.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddInfrastructure(builder.Configuration);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();

    // Dev-only pages in wwwroot/dev, e.g. http://localhost:5080/dev/player-test/
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseCors();

// Serve packaged video (DASH/HLS manifests + segments) at /media.
// Later phases will put an auth check in front of this; the DRM license endpoint protects the keys.
var mediaRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath,
    app.Configuration["Media:PackagedRoot"] ?? "../../../media/packaged"));
Directory.CreateDirectory(mediaRoot);

var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".mpd"] = "application/dash+xml";
contentTypes.Mappings[".m3u8"] = "application/vnd.apple.mpegurl";
contentTypes.Mappings[".m4s"] = "video/iso.segment";
contentTypes.Mappings[".vtt"] = "text/vtt";

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = "/media",
    ContentTypeProvider = contentTypes,
});

app.UseAuthorization();
app.MapControllers();

app.Run();
