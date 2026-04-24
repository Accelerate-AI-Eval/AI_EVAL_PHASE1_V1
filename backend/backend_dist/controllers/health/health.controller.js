const healthCheck = async (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
};
export default healthCheck;
