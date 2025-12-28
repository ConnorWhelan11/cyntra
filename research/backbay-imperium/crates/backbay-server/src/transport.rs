//! Transport layer using renet_netcode for UDP communication.
//!
//! Handles socket binding, authentication, and packet routing.

use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use renet::RenetServer;
use renet_netcode::{NetcodeServerTransport, ServerAuthentication, ServerConfig};
use tracing::{error, info};

/// Protocol ID for Backbay Imperium (must match client)
/// "BACKBAY1" as hex bytes
pub const PROTOCOL_ID: u64 = 0xBAC_CBA_001;

/// Server transport configuration
pub struct TransportConfig {
    /// Public address for clients to connect
    pub public_address: SocketAddr,
    /// Maximum clients (players + observers)
    pub max_clients: usize,
    /// Optional private key for secure authentication (32 bytes)
    /// If None, uses unsecure authentication (for development)
    pub private_key: Option<[u8; 32]>,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            public_address: "127.0.0.1:7777".parse().unwrap(),
            max_clients: 12, // 8 players + 4 observers
            private_key: None,
        }
    }
}

/// Creates server transport with netcode authentication
pub fn create_server_transport(
    config: TransportConfig,
) -> Result<NetcodeServerTransport, TransportError> {
    let socket = UdpSocket::bind(config.public_address)
        .map_err(|e| TransportError::BindFailed(config.public_address, e))?;

    let bound_addr = socket
        .local_addr()
        .map_err(|e| TransportError::LocalAddrFailed(config.public_address, e))?;

    socket
        .set_nonblocking(true)
        .map_err(TransportError::SocketConfig)?;

    let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();

    let authentication = match config.private_key {
        Some(key) => ServerAuthentication::Secure { private_key: key },
        None => ServerAuthentication::Unsecure,
    };

    let server_config = ServerConfig {
        current_time,
        max_clients: config.max_clients,
        protocol_id: PROTOCOL_ID,
        public_addresses: vec![bound_addr],
        authentication,
    };

    let transport = NetcodeServerTransport::new(server_config, socket)
        .map_err(|e| TransportError::TransportCreation(e.to_string()))?;

    info!(
        "Transport bound to {} (max {} clients, protocol {:016x})",
        config.public_address, config.max_clients, PROTOCOL_ID
    );

    Ok(transport)
}

/// Transport error types
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("Failed to bind socket to {0}: {1}")]
    BindFailed(SocketAddr, std::io::Error),

    #[error("Failed to determine bound address for {0}: {1}")]
    LocalAddrFailed(SocketAddr, std::io::Error),

    #[error("Failed to configure socket: {0}")]
    SocketConfig(std::io::Error),

    #[error("Failed to create transport: {0}")]
    TransportCreation(String),
}

/// Server runner that combines RenetServer with NetcodeServerTransport
pub struct ServerRunner {
    transport: NetcodeServerTransport,
}

impl ServerRunner {
    pub fn new(config: TransportConfig) -> Result<Self, TransportError> {
        let transport = create_server_transport(config)?;
        Ok(Self { transport })
    }

    /// Run a single tick of the transport layer
    pub fn update(&mut self, renet_server: &mut RenetServer, _delta: Duration) {
        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();

        // Receive packets from network
        if let Err(e) = self.transport.update(current_time, renet_server) {
            error!("Transport update error: {}", e);
        }

        // Send packets to network
        self.transport.send_packets(renet_server);
    }

    /// Get the bound address
    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.transport.addresses().first().copied()
    }
}

// Note: For secure authentication, clients need a connect token generated
// by a separate authentication service. For development, use Unsecure mode.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_transport_default() {
        // Use a random port for testing
        let config = TransportConfig {
            public_address: "127.0.0.1:0".parse().unwrap(),
            ..Default::default()
        };

        let transport = create_server_transport(config);
        match transport {
            Ok(_) => {}
            Err(TransportError::BindFailed(_, err))
                if err.kind() == std::io::ErrorKind::PermissionDenied =>
            {
                // Some sandboxed environments disallow socket binds.
            }
            Err(err) => panic!("transport error: {err:?}"),
        }
    }

    #[test]
    fn protocol_id_is_valid() {
        // Protocol ID should be non-zero
        assert!(PROTOCOL_ID > 0);
    }
}
