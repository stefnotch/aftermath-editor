use input_tree::node::InputNode;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum SerializedDataType {
    JsonInputTree,
}

#[derive(Deserialize, Serialize)]
struct SerializedData<T> {
    version: u32,
    data: T,
}

#[derive(Error, Debug)]
pub enum SerializationError {
    #[error("Could not serialize as JSON")]
    JsonInputTree(#[from] serde_json::Error),
}

// Later we could also serialize the parse tree, and do smort things like "warning: definition of e has changed"
pub fn serialize_input_nodes(
    nodes: &[InputNode],
    data_type: SerializedDataType,
) -> Result<String, SerializationError> {
    let data = &SerializedData {
        version: 1,
        data: nodes,
    };
    match data_type {
        SerializedDataType::JsonInputTree => Ok(serde_json::to_string(data)?),
    }
}

pub fn deserialize_input_nodes(
    data: String,
    data_type: Option<SerializedDataType>,
) -> Result<Vec<InputNode>, SerializationError> {
    match data_type {
        Some(SerializedDataType::JsonInputTree) => {
            let data: SerializedData<Vec<InputNode>> = serde_json::from_str(&data)?;
            // TODO: Migrate data to latest version?
            Ok(data.data)
        }
        None => {
            // Auto-detect the data type
            todo!();
        }
    }
}
