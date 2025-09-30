# Privacy Policy

Effective Date: September 27, 2025

This privacy policy explains how the Personal Assistant MCP Server collects telemetry data to improve its products and services.

## Data Collection

The Personal Assistant MCP Server collects limited telemetry data using standard OpenTelemetry instrumentation to help us understand usage patterns, detect errors, and improve the tool. Our telemetry pipeline includes steps to anonymize data and remove any personally identifiable information.

### What We Collect

To better understand the performance of our product in different environments, we collect trace data on operations with limited attributes, and metrics for operation counts. This includes, but is not limited to, the following data:

- **Span Name**: Name of the operation called
- **Span ID**: Random identifier for the span (ex. `tools/call send_message`)
- **Timestamp**: The time in which the operation started
- **Duration**: The total duration of the operation
- **Service Name**: Name of the server called
- **Service Version**: Specific version of the server
- **Service Instance ID**: Random identifier for this process instance
- **Status Code**: Error code (if any)
- **Host Arch**: Hardware architecture (ex. `arm64`, `amd64`)
- **Method Name**: Capability-specific name (ex. `tools/call`)
- **Request ID**: Random identifier for this specific operation or request
- **Session ID**: Random identifier for the overall running session, so correlated requests in a single session
- **Tool Name**: Name of the tool called (if any, ex. `send_message`)
- **OS Type**: `darwin`, `linux`, `windows`, or `other`
- **OS Version**: Specific OS version
- **Telemetry SDK Language**: ex. `nodejs`
- **Telemetry SDK Name**: ex. `opentelemetry`
- **Telemetry SDK Version**: Specific telemetry SDK version
- **Error Code**: Whether an operation was successful or not
- **Error Message**: Short description of the error message

### What We DO NOT Collect

We explicitly DO NOT collect:

- **Personal information (PII)**: Any personally identifiable information
- **IP addresses and Ports**: Your network information
- **Usernames**: System or account usernames
- **Arguments for operations**: Any of the data entered by the user as arguments or parameters for operations

## Data Usage

The collected data is used for:

- Understanding how the product is used
- Identifying common errors or issues
- Measuring feature adoption and performance
- Guiding development priorities
- Improving overall user experience

## Privacy Protection

We take your privacy seriously:

- All IDs are randomly-generated UUIDs, not derived from your machine hardware ID
- All data is sent securely via HTTPS to telemetry collectors
- Data is only used in aggregate form for statistical analysis
- We implement robust sanitization of all data to ensure any potential PII is never included in telemetry
- We maintain data minimization principles - only collecting essential data for explicit purposes
- All telemetry is processed in a way that does not connect it to specific individuals

## Data Retention

Telemetry data is retained for a period of 12 months, after which it is automatically deleted from our collector infrastructure

## User Control

Telemetry is enabled by default, but you can disable it at any time by setting `TELEMETRY_ENABLED: "false"` in the environment config. When disabled, no telemetry data will be shared without the user's explicit permission.

## Legal Basis

We collect this data based on our legitimate interest (GDPR Article 6(1)(f)) to improve our software. Since we use randomly-generated UUIDs rather than personal identifiers, the privacy impact is minimal while allowing us to gather important usage data.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be posted in this document and in release notes.

## Contact

If you have any questions about this privacy policy or our data practices, please contact the project maintainer at [depeakkamboj on GitHub](https://github.com/depeakkamboj).

## Acknowledgements

This policy is adapted from the [Privacy Policy for DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/PRIVACY.md), with appropriate modifications for the Personal Assistant MCP Server project.
