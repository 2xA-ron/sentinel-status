# Build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY SentinelOps.Api.csproj ./
RUN dotnet restore SentinelOps.Api.csproj

COPY . .
RUN dotnet publish SentinelOps.Api.csproj -c Release -o /app --no-restore

# Run
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Cloud Run injects $PORT (defaults to 8080); the .NET 8 base image already
# listens on 8080 via ASPNETCORE_HTTP_PORTS, so this just makes it explicit
# and keeps the container working if Cloud Run ever passes a different port.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "SentinelOps.Api.dll"]
